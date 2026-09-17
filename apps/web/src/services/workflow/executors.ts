/**
 * Stage executors for the Run Wonder workflow. Each does real work on real
 * data (mock sources, deterministic AI) and reports progress through the
 * engine context — the UI only ever renders engine state.
 */
import type { StageExecutor } from "@/domain/workflow/engine";
import type { StageKey } from "@/domain/workflow/stages";
import type { CanonicalJob, Job, JobMatch, JobQuality } from "@/domain/jobs/types";
import { ProviderError } from "@/domain/ai/types";
import { computeMatch, computeQuality, deduplicate } from "@/services/jobs/matching";
import { getSourceAdapter, SourceUnavailableError } from "@/services/jobs/sources";
import type { AIService } from "@/services/ai/service";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { track } from "@/lib/analytics";

export interface ExecutorDeps {
  ai: (runId: string) => AIService;
}

const CHUNK = 96;

export function createExecutors(deps: ExecutorDeps): Record<StageKey, StageExecutor> {
  return {
    profile: async (ctx) => {
      const dna = useCareerStore.getState().dna;
      await ctx.sleep(400);
      await ctx.checkpoint();
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
      };
    },

    search: async (ctx) => {
      const sourceIds = ctx.run.config.sourceIds.length ? ctx.run.config.sourceIds : useJobsStore.getState().sources.filter((s) => s.enabled).map((s) => s.id);
      const enabled = useJobsStore.getState().sources.filter((s) => s.enabled && sourceIds.includes(s.id));
      const discovered: Job[] = [];
      const perSource: Record<string, number> = {};
      const failures: string[] = [];
      ctx.setProgress(0, null);
      for (const src of enabled) {
        const adapter = getSourceAdapter(src.id);
        if (!adapter) continue;
        try {
          for await (const page of adapter.search(ctx.run.config.searchCriteria, { sleep: ctx.sleep })) {
            await ctx.checkpoint();
            discovered.push(...page.jobs);
            perSource[src.id] = (perSource[src.id] ?? 0) + page.jobs.length;
            ctx.setProgress(discovered.length, null);
            ctx.setCounts({ discovered: discovered.length, sources: Object.keys(perSource).length });
          }
          ctx.addEvidence({ label: src.name, value: `${(perSource[src.id] ?? 0).toLocaleString("en-IN")} jobs`, tone: "success" });
        } catch (e) {
          if (e instanceof SourceUnavailableError) {
            failures.push(src.name);
            ctx.addEvidence({ label: src.name, value: "Unavailable", tone: "danger" });
            ctx.warn(`${src.name} is temporarily unavailable. Other sources completed successfully.`);
          } else throw e;
        }
      }
      ctx.setProgress(discovered.length, discovered.length);
      if (!discovered.length) {
        ctx.fail({ category: failures.length ? "recoverable" : "user_action_required", message: failures.length ? `All sources failed (${failures.join(", ")}). Retry in a moment.` : "No jobs matched your search. Widen the query or locations.", actions: ["retry", "fix_config", "stop"] });
      }
      // Keep raw postings in memory for later stages without bloating persisted state.
      rawCache.set(ctx.run.id, discovered);
      return { data: { jobIds: discovered.map((j) => j.id), perSource }, counts: { discovered: discovered.length, sources: enabled.length } };
    },

    dedupe: async (ctx) => {
      const raw = rawCache.get(ctx.run.id) ?? [];
      const out: CanonicalJob[] = [];
      let processed = 0;
      ctx.setProgress(0, raw.length);
      // Process in chunks so pause/stop/restart stay responsive and counts are real.
      const groups = new Map<string, Job[]>();
      for (let i = 0; i < raw.length; i += CHUNK) {
        const chunk = raw.slice(i, i + CHUNK);
        for (const j of deduplicate(chunk)) {
          const list = groups.get(j.canonicalKey) ?? [];
          groups.set(j.canonicalKey, list);
        }
        processed += chunk.length;
        ctx.setProgress(processed, raw.length);
        await ctx.sleep(35);
        await ctx.checkpoint();
      }
      out.push(...deduplicate(raw));
      canonicalCache.set(ctx.run.id, out);
      const dupes = raw.length - out.length;
      ctx.setCounts({ unique: out.length, duplicates: dupes });
      ctx.addEvidence({ label: "Unique opportunities", value: out.length.toLocaleString("en-IN"), tone: "success" });
      ctx.addEvidence({ label: "Cross-posted duplicates removed", value: dupes.toLocaleString("en-IN") });
      return { provenance: "SYSTEM_DERIVED", data: { jobIds: out.map((j) => j.id) }, counts: { unique: out.length, duplicates: dupes } };
    },

    understand: async (ctx) => {
      const jobs = canonicalCache.get(ctx.run.id) ?? [];
      let analyzed = 0;
      let withSalary = 0;
      const seniority: Record<string, number> = {};
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) {
          if (j.salaryMax != null) withSalary++;
          seniority[j.seniority] = (seniority[j.seniority] ?? 0) + 1;
          analyzed++;
        }
        ctx.setProgress(analyzed, jobs.length);
        ctx.setCounts({ analyzed });
        await ctx.sleep(120);
        await ctx.checkpoint();
      }
      ctx.addEvidence({ label: "Salary disclosed", value: `${Math.round((withSalary / Math.max(1, jobs.length)) * 100)}%` });
      ctx.addEvidence({ label: "Senior+ roles", value: `${((seniority.senior ?? 0) + (seniority.lead ?? 0) + (seniority.director ?? 0)).toLocaleString("en-IN")}` });
      return { data: { analyzedIds: jobs.map((j) => j.id), seniority }, counts: { analyzed } };
    },

    match: async (ctx) => {
      const jobs = canonicalCache.get(ctx.run.id) ?? [];
      const dna = useCareerStore.getState().dna;
      const preferredLocations = ctx.get<string[]>("preferredLocations");
      const minSalary = ctx.get<number>("minSalary");
      const careerGoal = ctx.get<string>("careerGoal");
      const matches: JobMatch[] = [];
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) matches.push(computeMatch(j, { dna, preferredLocations, minSalary, careerGoal }));
        ctx.setProgress(matches.length, jobs.length);
        await ctx.sleep(90);
        await ctx.checkpoint();
      }
      matchCache.set(ctx.run.id, matches);
      const strong = matches.filter((m) => m.fit === "strong").length;
      const worth = matches.filter((m) => m.fit === "worth_considering").length;
      ctx.setCounts({ matched: matches.length, strong, worth_considering: worth });
      ctx.addEvidence({ label: "Strong opportunities", value: String(strong), tone: "success" });
      ctx.addEvidence({ label: "Worth considering", value: String(worth) });
      if (preferredLocations) ctx.addEvidence({ label: "Locations used", value: preferredLocations.join(", "), tone: "info" });
      return { data: { strong, worthConsidering: worth, location: preferredLocations?.join(", ") }, counts: { matched: matches.length, strong } };
    },

    quality: async (ctx) => {
      const jobs = canonicalCache.get(ctx.run.id) ?? [];
      const sources = Object.fromEntries(useJobsStore.getState().sources.map((s) => [s.id, s]));
      const out: JobQuality[] = [];
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) out.push(computeQuality(j, sources));
        ctx.setProgress(out.length, jobs.length);
        await ctx.sleep(60);
        await ctx.checkpoint();
      }
      qualityCache.set(ctx.run.id, out);
      const low = out.filter((q) => q.confidence === "low").length;
      ctx.setCounts({ checked: out.length, low_confidence: low });
      ctx.addEvidence({ label: "Low hiring confidence", value: String(low), tone: low ? "warning" : "success" });
      return { data: { lowConfidence: low }, counts: { checked: out.length } };
    },

    rank: async (ctx) => {
      const jobs = canonicalCache.get(ctx.run.id) ?? [];
      const matches = matchCache.get(ctx.run.id) ?? [];
      const quality = qualityCache.get(ctx.run.id) ?? [];
      const threshold = ctx.get<number>("minMatchThreshold") ?? ctx.run.config.minMatchThreshold;
      const max = ctx.run.config.maxResults;
      await ctx.sleep(300);
      await ctx.checkpoint();
      const qualityById = new Map(quality.map((q) => [q.jobId, q]));
      const ranked = [...matches]
        .filter((m) => m.score >= threshold && qualityById.get(m.jobId)?.confidence !== "low")
        .sort((a, b) => b.score - a.score)
        .slice(0, max);
      const strong = ranked.filter((m) => m.fit === "strong");
      // Publish to the product: the jobs catalog reflects this run.
      const jobsStore = useJobsStore.getState();
      jobsStore.replaceCatalog(jobs);
      jobsStore.setMatches(matches);
      jobsStore.setQuality(quality);
      let saved = 0;
      if (ctx.policy("save_jobs") === "run") {
        for (const m of strong) {
          if (!jobsStore.saved[m.jobId] && !jobsStore.rejected[m.jobId]) {
            jobsStore.save(m.jobId);
            saved++;
          }
        }
      }
      ctx.setProgress(ranked.length, ranked.length);
      ctx.setCounts({ ranked: ranked.length, strong_matches: strong.length, saved });
      ctx.addEvidence({ label: "Shortlist", value: `${ranked.length} roles above ${threshold}` });
      ctx.addEvidence({ label: "Strong matches", value: String(strong.length), tone: "success" });
      if (saved) ctx.addEvidence({ label: "Saved automatically", value: String(saved), tone: "info" });
      rankedCache.set(ctx.run.id, ranked.map((m) => m.jobId));
      return { data: { rankedJobIds: ranked.map((m) => m.jobId), strongMatches: strong.length, savedCount: saved }, counts: { ranked: ranked.length, strong_matches: strong.length } };
    },

    prepare: async (ctx) => {
      const ranked = rankedCache.get(ctx.run.id) ?? [];
      const jobs = new Map((canonicalCache.get(ctx.run.id) ?? []).map((j) => [j.id, j]));
      const matches = new Map((matchCache.get(ctx.run.id) ?? []).map((m) => [m.jobId, m]));
      const targets = ranked.filter((id) => matches.get(id)?.fit === "strong").slice(0, 3);
      const apps = useApplicationsStore.getState();
      const dna = useCareerStore.getState().dna;
      const ai = deps.ai(ctx.run.id);
      const applicationIds: string[] = [];
      ctx.setProgress(0, targets.length);
      const wantResume = ctx.policy("generate_resume") !== "skip";
      const wantCover = ctx.policy("generate_cover_letter") !== "skip";
      for (const [i, jobId] of targets.entries()) {
        const job = jobs.get(jobId);
        if (!job) continue;
        const app = apps.create(jobId, "preparing");
        if (app.status !== "preparing") {
          // Already further along (e.g. submitted) — never regress an application.
          applicationIds.push(app.id);
          ctx.addEvidence({ label: `${job.title} · ${job.company}`, value: `Already ${app.status.replace(/_/g, " ")}`, tone: "info" });
          ctx.setProgress(i + 1, targets.length);
          continue;
        }
        track("application_preparation_started", { applicationId: app.id, jobId });
        useApplicationsStore.getState().setStatus(app.id, "preparing");
        try {
          if (wantResume) {
            const resume = await ai.generateResume({ job, dna, runId: ctx.run.id });
            await ctx.checkpoint();
            useApplicationsStore.getState().addVersion(app.id, "resume", { provenance: "AI_GENERATED", content: resume, note: "Tailored by Wonder" });
          }
          if (wantCover) {
            const cover = await ai.generateCoverLetter({ job, dna, runId: ctx.run.id });
            await ctx.checkpoint();
            useApplicationsStore.getState().addVersion(app.id, "cover_letter", { provenance: "AI_GENERATED", content: cover, note: "Drafted by Wonder" });
          }
          const answers = await ai.generateScreeningAnswers({ job, dna, runId: ctx.run.id });
          await ctx.checkpoint();
          useApplicationsStore.getState().addVersion(app.id, "answers", { provenance: "AI_GENERATED", content: answers, note: "Drafted by Wonder" });
          useApplicationsStore.getState().setStatus(app.id, "ready_for_review", { type: "prepared", title: "Application prepared", detail: "Resume, cover letter and answers drafted by Wonder" });
          useApplicationsStore.getState().setNextAction(app.id, "Review tailored materials");
          track("application_preparation_completed", { applicationId: app.id });
          applicationIds.push(app.id);
          ctx.addEvidence({ label: `${job.title} · ${job.company}`, value: "Ready for review", tone: "success" });
        } catch (e) {
          if (e instanceof ProviderError) {
            ctx.fail({
              category: "user_action_required",
              message: `${providerName(e.provider)} could not complete the request: ${e.message}`,
              source: e.provider,
              actions: ["retry", "change_provider", "fix_config", "stop"],
              code: e.kind,
            });
          }
          throw e;
        }
        ctx.setProgress(i + 1, targets.length);
      }
      if (targets.length) useCareerStore.getState().addActivity({ kind: "application_prepared", title: `${applicationIds.length} application${applicationIds.length === 1 ? "" : "s"} prepared`, subtitle: "Ready for your review", href: "/app/applications?tab=in_progress" });
      return { data: { applicationIds }, counts: { prepared: applicationIds.length } };
    },

    review: async (ctx) => {
      const ids = ctx.output<{ applicationIds: string[] }>("prepare")?.applicationIds ?? [];
      if (ids.length === 0) {
        ctx.addEvidence({ label: "Nothing to review", value: "No applications were prepared in this run." });
        return { data: { reviewedApplicationIds: [] } };
      }
      await ctx.requestUser(`${ids.length} prepared application${ids.length === 1 ? "" : "s"} are ready. Review them, edit anything you like, then continue.`);
      return { provenance: "USER_PROVIDED", data: { reviewedApplicationIds: ids } };
    },

    apply: async (ctx) => {
      const ids = ctx.output<{ reviewedApplicationIds: string[] }>("review")?.reviewedApplicationIds ?? [];
      const appsState = useApplicationsStore.getState();
      const jobs = useJobsStore.getState().jobs;
      const decision = ctx.policy("submit_application");
      if (decision === "skip") {
        ctx.addEvidence({ label: "Skipped", value: "Submitting applications is turned off in Automation Settings." });
        return { data: { submittedApplicationIds: [] } };
      }
      const actions = ids
        .map((id) => appsState.applications[id])
        .filter((a): a is NonNullable<typeof a> => !!a && a.status === "ready_for_review")
        .map((a) => {
          const job = jobs[a.jobId];
          return ctx.registerAction({ type: "submit_application", idempotencyKey: a.submissionKey, targetId: a.id, label: `Submit application to ${job?.company ?? "employer"} — ${job?.title ?? "role"}` });
        });
      const pending = actions.filter((a) => a.status === "pending_confirmation");
      if (pending.length) {
        if (decision === "run") {
          for (const a of pending) {
            a.status = "confirmed";
            a.history.push({ at: new Date().toISOString(), event: "confirmed", detail: "Auto-confirmed by your automation policy (Autonomous)" });
          }
        } else {
          await ctx.requestUser(`Wonder will submit ${pending.length} application${pending.length === 1 ? "" : "s"} on your behalf. Approve each one, or decline.`);
        }
      }
      const submitted: string[] = [];
      for (const a of actions) {
        const fresh = ctx.run.actions.find((x) => x.id === a.id) ?? a;
        if (fresh.status !== "confirmed") continue;
        await ctx.executeAction(fresh.id, async () => {
          await ctx.sleep(600);
          useApplicationsStore.getState().setStatus(fresh.targetId, "submitted", { type: "submitted", title: "Submitted", detail: "Submitted by Wonder with your approval" });
          track("application_submitted", { applicationId: fresh.targetId });
        });
        if ((ctx.run.actions.find((x) => x.id === a.id) ?? fresh).status === "succeeded") submitted.push(fresh.targetId);
        ctx.setProgress(submitted.length, actions.length);
      }
      const declined = ctx.run.actions.filter((x) => x.status === "rejected").length;
      ctx.setCounts({ submitted: submitted.length, declined });
      ctx.addEvidence({ label: "Submitted", value: String(submitted.length), tone: submitted.length ? "success" : "neutral" });
      if (declined) ctx.addEvidence({ label: "Declined by you", value: String(declined) });
      return { data: { submittedApplicationIds: submitted }, counts: { submitted: submitted.length } };
    },

    track: async (ctx) => {
      const submitted = ctx.output<{ submittedApplicationIds: string[] }>("apply")?.submittedApplicationIds ?? [];
      await ctx.sleep(300);
      await ctx.checkpoint();
      const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
      for (const id of submitted) {
        useApplicationsStore.getState().addFollowUp(id, { dueAt: due, kind: "follow_up", note: "Follow up if there is no response" });
        useApplicationsStore.getState().setNextAction(id, "Wait for response · follow up in 5 days", due);
      }
      ctx.setProgress(submitted.length, submitted.length);
      ctx.addEvidence({ label: "Follow-ups scheduled", value: String(submitted.length) });
      return { provenance: "SYSTEM_DERIVED", data: { followUpsScheduled: submitted.length } };
    },

    learn: async (ctx) => {
      const ranked = rankedCache.get(ctx.run.id) ?? [];
      const jobs = new Map((canonicalCache.get(ctx.run.id) ?? []).map((j) => [j.id, j]));
      const strong = ctx.output<{ strongMatches: number }>("rank")?.strongMatches ?? 0;
      const titles = ranked.map((id) => jobs.get(id)?.title).filter((t): t is string => !!t);
      const top = [...new Set(titles)].slice(0, 3);
      const ai = deps.ai(ctx.run.id);
      const dna = useCareerStore.getState().dna;
      const text = await ai.careerInsight({ dna, strongMatches: strong, topTitles: top });
      await ctx.checkpoint();
      ctx.setProgress(1, 1);
      ctx.addEvidence({ label: "Insight", value: text });
      const suggestion = ctx.policy("change_search_preferences") === "run" ? undefined : { text: "Wonder suggests narrowing your search to senior product roles. Update your preferences?", href: "/app/career-dna" };
      useCareerStore.getState().setInsights([{ id: `ins_${ctx.run.id}`, title: "From this run", body: text, suggestion }, ...useCareerStore.getState().insights.filter((i) => !i.id.startsWith("ins_run")).slice(0, 2)]);
      return { data: { insight: text, topTitles: top } };
    },
  };
}

function providerName(id: string) {
  return { wonderjobs: "WonderJobs AI", anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini" }[id] ?? id;
}

// Per-run working memory for large intermediate results (not persisted).
const rawCache = new Map<string, Job[]>();
const canonicalCache = new Map<string, CanonicalJob[]>();
const matchCache = new Map<string, JobMatch[]>();
const qualityCache = new Map<string, JobQuality[]>();
const rankedCache = new Map<string, string[]>();

/** Rehydrate working memory for a rerun from the parent run's caches, when available. */
export function inheritCaches(parentRunId: string, childRunId: string) {
  for (const cache of [rawCache, canonicalCache, matchCache, qualityCache, rankedCache] as Map<string, unknown>[]) {
    const v = cache.get(parentRunId);
    if (v !== undefined) cache.set(childRunId, v);
  }
}

/** For reruns whose parent caches are gone (page reload), rebuild from the product catalog. */
export function seedCachesFromCatalog(runId: string) {
  const s = useJobsStore.getState();
  if (!s.loaded) s.loadInitial();
  const jobs = useJobsStore.getState().order.map((id) => useJobsStore.getState().jobs[id]);
  canonicalCache.set(runId, jobs);
  matchCache.set(runId, jobs.map((j) => useJobsStore.getState().matches[j.id]).filter(Boolean));
  qualityCache.set(runId, jobs.map((j) => useJobsStore.getState().quality[j.id]).filter(Boolean));
  rankedCache.set(
    runId,
    jobs
      .map((j) => useJobsStore.getState().matches[j.id])
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((m) => m.jobId),
  );
}
