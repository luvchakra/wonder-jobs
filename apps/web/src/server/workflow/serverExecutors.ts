/**
 * Stage executors that run on the server, for scheduled runs fired by the cron.
 *
 * They do the same work as the browser executors (`services/workflow/executors.ts`) against the same
 * engine, with two differences: state comes from a `TenantSnapshot` instead of Zustand, and nothing
 * sleeps for effect — a cron invocation has a wall-clock budget and no one is watching a progress bar.
 *
 * Only the stages that need no human present are here. Preparing and submitting applications require
 * the candidate's review and consent (spec §12), so a scheduled run stops at `rank` and the shortlist
 * is waiting when they next open the app.
 */
import type { StageExecutor, StageResult } from "@/domain/workflow/engine";
import type { StageKey } from "@/domain/workflow/stages";
import type { CanonicalJob, Job, JobMatch, JobQuality, JobSource } from "@/domain/jobs/types";
import { computeMatch, computeQuality, deduplicate } from "@/services/jobs/matching";
import { searchSource, SourceNeedsSetupError } from "@/server/jobs/search";
import type { TenantSnapshot } from "./snapshot";

/** The stages a scheduled run can complete without the candidate. Order matters: it is the run order. */
export const SERVER_STAGE_KEYS = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"] as const satisfies readonly StageKey[];

export function isServerStage(key: StageKey): boolean {
  return (SERVER_STAGE_KEYS as readonly StageKey[]).includes(key);
}

export interface ServerRunOutcome {
  /** Jobs the run published to the catalog, ready for the next snapshot save. */
  jobsTouched: boolean;
}

export function createServerExecutors(snapshot: TenantSnapshot, outcome: ServerRunOutcome): Partial<Record<StageKey, StageExecutor>> {
  // Per-run working memory. Large and intermediate: never persisted, dropped when the run ends.
  const raw: Job[] = [];
  let canonical: CanonicalJob[] = [];
  let matches: JobMatch[] = [];
  let quality: JobQuality[] = [];

  return {
    profile: async (ctx) => {
      const dna = snapshot.career.dna;
      ctx.setProgress(1, 1);
      ctx.addEvidence({ label: "Skills", value: `${dna.skills.length} skills · ${dna.skills.filter((s) => s.level >= 4).length} strong` });
      ctx.addEvidence({ label: "Target", value: `${dna.seniority} · ${dna.industries.slice(0, 3).join(", ")}` });
      ctx.addEvidence({ label: "Locations", value: dna.preferredLocations.join(", ") });
      return {
        provenance: "SYSTEM_DERIVED",
        data: {
          preferredLocations: dna.preferredLocations,
          minSalary: dna.minSalary,
          careerGoal: ctx.run.config.careerGoal || dna.careerGoal,
          seniority: dna.seniority,
          skillCount: dna.skills.length,
        },
      } satisfies StageResult;
    },

    search: async (ctx) => {
      const wanted = ctx.run.config.sourceIds;
      const sources: JobSource[] = snapshot.jobs.sources.filter((s) => s.enabled && (wanted.length ? wanted.includes(s.id) : true));
      const criteria = { query: ctx.run.config.searchCriteria.query, locations: ctx.run.config.searchCriteria.locations };
      const perSource: Record<string, number> = {};
      const failures: string[] = [];
      ctx.setProgress(0, null);
      // Sequential on purpose: sources are third-party APIs and a cron has no reason to burst them.
      for (const src of sources) {
        await ctx.checkpoint();
        try {
          const { jobs } = await searchSource(src.id, criteria);
          raw.push(...jobs);
          perSource[src.id] = jobs.length;
          ctx.addEvidence({ label: src.name, value: `${jobs.length.toLocaleString("en-IN")} jobs`, tone: "success" });
        } catch (e) {
          if (e instanceof SourceNeedsSetupError) {
            ctx.addEvidence({ label: src.name, value: "Needs setup", tone: "warning" });
            ctx.warn(`${src.name} isn't configured on this deployment yet, so it was skipped.`);
          } else {
            failures.push(src.name);
            ctx.addEvidence({ label: src.name, value: "Unavailable", tone: "danger" });
            ctx.warn(`${src.name} is temporarily unavailable: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        ctx.setProgress(raw.length, null);
        ctx.setCounts({ discovered: raw.length, sources: Object.keys(perSource).length });
      }
      ctx.setProgress(raw.length, raw.length);
      if (!raw.length) {
        // Fatal rather than recoverable: the browser downgrades this to a warning because someone is
        // watching and can retry, but a scheduled run with nothing to show has simply failed, and saying
        // so is what puts it in front of the candidate. The next tick is the retry.
        ctx.fail({
          category: "fatal",
          message: failures.length ? `Every source failed (${failures.join(", ")}). The next scheduled run will try again.` : "No jobs matched your search. Widen the query or locations in this schedule.",
          actions: ["retry", "fix_config", "stop"],
        });
      }
      return { data: { jobIds: raw.map((j) => j.id), perSource }, counts: { discovered: raw.length, sources: sources.length } };
    },

    dedupe: async (ctx) => {
      canonical = deduplicate(raw);
      const duplicates = raw.length - canonical.length;
      ctx.setProgress(raw.length, raw.length);
      ctx.setCounts({ unique: canonical.length, duplicates });
      ctx.addEvidence({ label: "Unique opportunities", value: canonical.length.toLocaleString("en-IN"), tone: "success" });
      ctx.addEvidence({ label: "Cross-posted duplicates removed", value: duplicates.toLocaleString("en-IN") });
      return { provenance: "SYSTEM_DERIVED", data: { jobIds: canonical.map((j) => j.id) }, counts: { unique: canonical.length, duplicates } };
    },

    understand: async (ctx) => {
      let withSalary = 0;
      const seniority: Record<string, number> = {};
      for (const j of canonical) {
        if (j.salaryMax != null) withSalary++;
        seniority[j.seniority] = (seniority[j.seniority] ?? 0) + 1;
      }
      ctx.setProgress(canonical.length, canonical.length);
      ctx.setCounts({ analyzed: canonical.length });
      ctx.addEvidence({ label: "Salary disclosed", value: `${Math.round((withSalary / Math.max(1, canonical.length)) * 100)}%` });
      ctx.addEvidence({ label: "Senior+ roles", value: `${((seniority.senior ?? 0) + (seniority.lead ?? 0) + (seniority.director ?? 0)).toLocaleString("en-IN")}` });
      return { data: { analyzedIds: canonical.map((j) => j.id), seniority }, counts: { analyzed: canonical.length } };
    },

    match: async (ctx) => {
      const dna = snapshot.career.dna;
      const preferredLocations = ctx.get<string[]>("preferredLocations");
      const minSalary = ctx.get<number>("minSalary");
      const careerGoal = ctx.get<string>("careerGoal");
      const learnedSignals = snapshot.career.learnedSignals;
      matches = canonical.map((j) => computeMatch(j, { dna, preferredLocations, minSalary, careerGoal, learnedSignals }));
      const strong = matches.filter((m) => m.fit === "strong").length;
      const worth = matches.filter((m) => m.fit === "worth_considering").length;
      ctx.setProgress(matches.length, matches.length);
      ctx.setCounts({ matched: matches.length, strong, worth_considering: worth });
      ctx.addEvidence({ label: "Strong opportunities", value: String(strong), tone: "success" });
      ctx.addEvidence({ label: "Worth considering", value: String(worth) });
      return { data: { strong, worthConsidering: worth, location: preferredLocations?.join(", ") }, counts: { matched: matches.length, strong } };
    },

    quality: async (ctx) => {
      const sources = Object.fromEntries(snapshot.jobs.sources.map((s) => [s.id, s]));
      quality = canonical.map((j) => computeQuality(j, sources));
      const low = quality.filter((q) => q.confidence === "low").length;
      ctx.setProgress(quality.length, quality.length);
      ctx.setCounts({ checked: quality.length, low_confidence: low });
      ctx.addEvidence({ label: "Low hiring confidence", value: String(low), tone: low ? "warning" : "success" });
      return { data: { lowConfidence: low }, counts: { checked: quality.length } };
    },

    rank: async (ctx) => {
      const threshold = ctx.get<number>("minMatchThreshold") ?? ctx.run.config.minMatchThreshold;
      const qualityById = new Map(quality.map((q) => [q.jobId, q]));
      const ranked = [...matches]
        .filter((m) => m.score >= threshold && qualityById.get(m.jobId)?.confidence !== "low")
        .sort((a, b) => b.score - a.score)
        .slice(0, ctx.run.config.maxResults);
      const strong = ranked.filter((m) => m.fit === "strong");

      // Publish to the product exactly as the browser does: the catalog reflects this run.
      snapshot.jobs.jobs = Object.fromEntries(canonical.map((j) => [j.id, j]));
      snapshot.jobs.order = canonical.map((j) => j.id);
      for (const m of matches) snapshot.jobs.matches[m.jobId] = m;
      for (const q of quality) snapshot.jobs.quality[q.jobId] = q;
      let saved = 0;
      if (ctx.policy("save_jobs") === "run") {
        const at = new Date().toISOString();
        for (const m of strong) {
          if (!snapshot.jobs.saved[m.jobId] && !snapshot.jobs.rejected[m.jobId]) {
            snapshot.jobs.saved[m.jobId] = at;
            saved++;
          }
        }
      }
      outcome.jobsTouched = true;

      ctx.setProgress(ranked.length, ranked.length);
      ctx.setCounts({ ranked: ranked.length, strong_matches: strong.length, saved });
      ctx.addEvidence({ label: "Shortlist", value: `${ranked.length} roles above ${threshold}` });
      ctx.addEvidence({ label: "Strong matches", value: String(strong.length), tone: "success" });
      if (saved) ctx.addEvidence({ label: "Saved automatically", value: String(saved), tone: "info" });
      return { data: { rankedJobIds: ranked.map((m) => m.jobId), strongMatches: strong.length, savedCount: saved }, counts: { ranked: ranked.length, strong_matches: strong.length } };
    },
  };
}
