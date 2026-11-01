/**
 * Stage executors for the Run Wonder workflow. Each does real work on real
 * data (WorksLake search, the candidate's AI) and reports progress through the
 * engine context — the UI only ever renders engine state.
 */
import { RestartSignal, StopSignal, type StageContext, type StageExecutor } from "@/domain/workflow/engine";
import type { StageKey } from "@/domain/workflow/stages";
import type { CanonicalJob, JobMatch, JobQuality } from "@/domain/jobs/types";
import { ProviderError } from "@/domain/ai/types";
import { computeMatch, computeQuality } from "@/services/jobs/matching";
import { blendAiFit, blendAiQuality, jobForAi, profileForAi, profileKey, type AiFit } from "@/domain/jobs/aiFit";
import type { CareerDNA } from "@/domain/career/types";
import type { AIService } from "@/services/ai/service";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { track } from "@/lib/analytics";
import { getClientMode } from "@/lib/mode";
import type { SearchEvent, SearchResponse, SourceSearchStatus } from "@/domain/jobslake/protocol";
import { breadthEvidence, contributionBySource, phrasingEvidence, searchRequestFor, sourceEvidence, toCanonicalJob } from "@/domain/jobslake/wonderjobs";
import { MAX_VARIANTS, ruleVariants } from "@/domain/jobs/variants";
import { historyOf } from "@/domain/career/history";
import { JobsLakeError, reportContribution, searchJobs, searchJobsStream } from "@/services/jobs/jobsLakeClient";
import { jobsLakeCapability, setJobsLakeCapability } from "@/services/jobs/jobsLakeMode";

export interface ExecutorDeps {
  ai: (runId: string) => AIService;
}

const CHUNK = 96;

/** The model's fit read for the 30 leading postings (by rule score), or null — the rules' scores then stand. */
async function aiFitsFor(jobs: CanonicalJob[], matches: JobMatch[], dna: CareerDNA): Promise<Record<string, AiFit> | null> {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const top = [...matches].filter((m) => m.score >= 20).sort((a, b) => b.score - a.score).slice(0, 30).map((m) => byId.get(m.jobId)).filter((j): j is CanonicalJob => !!j);
  if (!top.length) return null;
  try {
    const res = await fetch("/api/ai/rank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: profileForAi(dna), jobs: top.map(jobForAi) }) });
    const data = (await res.json().catch(() => null)) as { scores?: { id: string; score: number; reason: string; flags?: AiFit["flags"] }[] | null } | null;
    if (!res.ok || !data?.scores?.length) return null;
    const profile = profileKey(dna);
    const at = new Date().toISOString();
    return Object.fromEntries(data.scores.map((x) => [x.id, { score: x.score, reason: x.reason, flags: x.flags ?? [], profile, at }]));
  } catch {
    return null;
  }
}

export function createExecutors(deps: ExecutorDeps): Record<StageKey, StageExecutor> {
  return {
    profile: async (ctx) => {
      const dna = useCareerStore.getState().dna;
      await ctx.sleep(0);
      await ctx.checkpoint();
      ctx.setProgress(1, 1);
      ctx.addEvidence({ label: "Skills", value: `${dna.skills.length} skills · ${dna.skills.filter((s) => s.level >= 4).length} strong` });
      ctx.addEvidence({ label: "Target", value: `${dna.seniority} · ${dna.industries.slice(0, 3).join(", ")}` });
      // Places and pay are the search's own (Refine's, for a Find search), not the Career Profile's.
      const criteria = ctx.run.config.searchCriteria;
      ctx.addEvidence({ label: "Locations", value: criteria.locations.join(", ") || "Anywhere" });
      return {
        provenance: "SYSTEM_DERIVED",
        data: {
          preferredLocations: criteria.locations,
          minSalary: criteria.minSalary,
          careerGoal: ctx.run.config.careerGoal || dna.careerGoal,
          seniority: dna.seniority,
          skillCount: dna.skills.length,
        },
      };
    },

    search: async (ctx) => {
      const sourceIds = ctx.run.config.sourceIds.length ? ctx.run.config.sourceIds : useJobsStore.getState().sources.filter((s) => s.enabled).map((s) => s.id);
      const enabled = useJobsStore.getState().sources.filter((s) => s.enabled && s.available !== false && sourceIds.includes(s.id));
      ctx.setProgress(0, null);
      // Search only through WorksLake — one request, every source, deduplicated with provenance.
      // When WorksLake is off or doesn't answer, the run says so; it never goes to a source directly.
      if (!enabled.length) ctx.fail({ category: "user_action_required", message: "No job sources are switched on. Turn one on and search again.", actions: ["fix_config", "stop"] });
      if (!jobsLakeCapability().search) ctx.fail({ category: "recoverable", message: "WorksLake search is switched off on this deployment, so Wonder can't search right now.", actions: ["retry", "stop"] });
      const lake = await searchWithJobsLake(ctx, enabled.map((s) => s.id));
      if (!lake) return ctx.fail({ category: "recoverable", message: "WorksLake didn't answer, so no new jobs were found. Retry in a moment.", actions: ["retry", "stop"] });
      lakeCache.set(ctx.run.id, lake);
      const m = lake.response.metadata;
      const discovered = m.retrieved + m.warm;
      ctx.setProgress(discovered, discovered);
      if (!lake.jobs.length) {
        const failed = lake.response.sources.filter((x) => x.outcome === "timeout" || x.outcome === "unavailable").map((x) => x.sourceName);
        const allFailed = failed.length > 0 && m.sourcesSucceeded === 0;
        ctx.fail({ category: allFailed ? "recoverable" : "user_action_required", message: allFailed ? `All sources failed (${failed.join(", ")}). Retry in a moment.` : "No jobs matched your search. Widen the query or locations.", actions: ["retry", "fix_config", "stop"] });
      }
      const perSource = Object.fromEntries(lake.response.sources.filter((x) => x.outcome === "ok" || x.outcome === "empty").map((x) => [x.sourceId, x.retrieved]));
      return { data: { jobIds: lake.jobs.map((j) => j.id), perSource, searchedWith: "WorksLake", requestId: lake.response.requestId }, counts: { discovered, sources: m.sourcesSucceeded } };
    },

    dedupe: async (ctx) => {
      const lake = lakeCache.get(ctx.run.id);
      // The search results live in memory only; a reload between stages loses them, so this says so instead of continuing with nothing.
      if (!lake) return ctx.fail({ category: "recoverable", message: "The search results were lost when the page reloaded. Search again.", actions: ["retry", "stop"] });
      // WorksLake already merged cross-posted duplicates (by apply URL, identity and content), keeping every sighting.
      const m = lake.response.metadata;
      canonicalCache.set(ctx.run.id, lake.jobs);
      ctx.setProgress(lake.jobs.length, lake.jobs.length);
      ctx.setCounts({ unique: lake.jobs.length, duplicates: m.duplicates });
      ctx.addEvidence({ label: "Unique opportunities", value: lake.jobs.length.toLocaleString("en-IN"), tone: "success" });
      ctx.addEvidence({ label: "Cross-posted duplicates merged", value: m.duplicates.toLocaleString("en-IN") });
      const multi = lake.jobs.filter((j) => (j.lake?.sightings.length ?? 0) > 1).length;
      if (multi) ctx.addEvidence({ label: "Found on more than one source", value: multi.toLocaleString("en-IN"), tone: "info" });
      const invalid = m.unique - m.live;
      if (invalid > 0) ctx.addEvidence({ label: "Left out: incomplete postings", value: invalid.toLocaleString("en-IN"), tone: "warning" });
      const cut = m.live + m.warm - lake.jobs.length;
      if (cut > 0) ctx.addEvidence({ label: "Left out: beyond the first " + lake.jobs.length.toLocaleString("en-IN"), value: cut.toLocaleString("en-IN"), tone: "info" });
      await ctx.checkpoint();
      return { provenance: "SYSTEM_DERIVED", data: { jobIds: lake.jobs.map((j) => j.id) }, counts: { unique: lake.jobs.length, duplicates: m.duplicates } };
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
        await ctx.sleep(0);
        await ctx.checkpoint();
      }
      ctx.addEvidence({ label: "Salary disclosed", value: `${Math.round((withSalary / Math.max(1, jobs.length)) * 100)}%` });
      ctx.addEvidence({ label: "Senior+ roles", value: `${((seniority.senior ?? 0) + (seniority.lead ?? 0) + (seniority.director ?? 0)).toLocaleString("en-IN")}` });
      return { data: { analyzedIds: jobs.map((j) => j.id), seniority }, counts: { analyzed } };
    },

    match: async (ctx) => {
      const jobs = canonicalCache.get(ctx.run.id) ?? [];
      const { dna, learnedSignals } = useCareerStore.getState();
      const preferredLocations = ctx.get<string[]>("preferredLocations");
      const minSalary = ctx.get<number>("minSalary");
      const careerGoal = ctx.get<string>("careerGoal");
      const matches: JobMatch[] = [];
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) matches.push(computeMatch(j, { dna, preferredLocations, minSalary, careerGoal, learnedSignals, searchQuery: typedQuery(ctx.run.config) }));
        ctx.setProgress(matches.length, jobs.length);
        await ctx.sleep(0);
        await ctx.checkpoint();
      }
      // A model reads the leading postings against the profile; its score nudges the rules' within a band.
      if (getClientMode().mode === "user") {
        const fits = await aiFitsFor(jobs, matches, dna);
        if (fits) {
          const profile = profileKey(dna);
          for (let i = 0; i < matches.length; i++) matches[i] = blendAiFit(matches[i], fits[matches[i].jobId], profile);
          useJobsStore.getState().setAiFits(fits);
          ctx.addEvidence({ label: "Read by AI", value: String(Object.keys(fits).length), tone: "info" });
        }
      }
      matchCache.set(ctx.run.id, matches);
      const lake = lakeCache.get(ctx.run.id);
      if (lake) reportContribution(lake.response.requestId, contributionBySource(jobs, Object.fromEntries(matches.map((m) => [m.jobId, m.fit]))));
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
      // The model's read of each posting (from the match stage) adds what the posting text itself shows.
      const aiFits = useJobsStore.getState().aiFits;
      const out: JobQuality[] = [];
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) out.push(blendAiQuality(computeQuality(j, sources), aiFits[j.id]));
        ctx.setProgress(out.length, jobs.length);
        await ctx.sleep(0);
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
      await ctx.sleep(0);
      await ctx.checkpoint();
      const qualityById = new Map(quality.map((q) => [q.jobId, q]));
      const ranked = [...matches]
        .filter((m) => m.score >= threshold && qualityById.get(m.jobId)?.confidence !== "low")
        .sort((a, b) => b.score - a.score)
        .slice(0, max);
      const strong = ranked.filter((m) => m.fit === "strong");
      // Publish to the product: the jobs catalog reflects this run.
      const jobsStore = useJobsStore.getState();
      // A search run as one of the candidate's roles labels what it found, so Apply can offer that role's résumé.
      const role = ctx.run.config.role;
      jobsStore.replaceCatalog(role ? jobs.map((j) => ({ ...j, foundAs: { id: role.id, title: role.title } })) : jobs, typedQuery(ctx.run.config) ?? "");
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
      ctx.addEvidence({ label: "Strong on the shortlist", value: String(strong.length), tone: "success" });
      if (saved) ctx.addEvidence({ label: "Saved automatically", value: String(saved), tone: "info" });
      rankedCache.set(ctx.run.id, ranked.map((m) => m.jobId));
      return { data: { rankedJobIds: ranked.map((m) => m.jobId), strongMatches: strong.length, savedCount: saved }, counts: { ranked: ranked.length, strong_matches: strong.length } };
    },

    prepare: async (ctx) => {
      const ranked = rankedCache.get(ctx.run.id) ?? [];
      const jobs = new Map((canonicalCache.get(ctx.run.id) ?? []).map((j) => [j.id, j]));
      const matches = new Map((matchCache.get(ctx.run.id) ?? []).map((m) => [m.jobId, m]));
      // Strong opportunities first; when there are fewer than three, the best "worth considering" roles fill in
      // so the candidate always gets tailored materials for the top of the shortlist.
      const strongIds = ranked.filter((id) => matches.get(id)?.fit === "strong");
      const targets = [...strongIds, ...ranked.filter((id) => matches.get(id)?.fit === "worth_considering")].slice(0, 3);
      if (targets.length && !strongIds.length) ctx.addEvidence({ label: "No strong matches", value: "Preparing the top of the shortlist instead", tone: "info" });
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
      await ctx.requestUser(`${ids.length} prepared application${ids.length === 1 ? " is" : "s are"} ready for you to review.`);
      return { provenance: "USER_PROVIDED", data: { reviewedApplicationIds: ids } };
    },

    apply: async (ctx) => {
      const ids = ctx.output<{ reviewedApplicationIds: string[] }>("review")?.reviewedApplicationIds ?? [];
      const appsState = useApplicationsStore.getState();
      const jobs = useJobsStore.getState().jobs;
      const decision = ctx.policy("submit_application");
      if (decision === "skip") {
        ctx.addEvidence({ label: "Skipped", value: "Submitting applications is turned off in Automation." });
        return { data: { submittedApplicationIds: [], handedOffApplicationIds: [] } };
      }
      // Wonder never submits on an employer's site on the candidate's behalf: employers' forms need the
      // candidate's own identity and consent. The external action is the hand-off: materials are final,
      // the employer's application page is opened for the candidate, and the tracker records it.
      const actions = ids
        .map((id) => appsState.applications[id])
        .filter((a): a is NonNullable<typeof a> => !!a && a.status === "ready_for_review")
        .map((a) => {
          const job = jobs[a.jobId];
          return ctx.registerAction({ type: "submit_application", idempotencyKey: a.submissionKey, targetId: a.id, label: `Hand off ${job?.title ?? "role"} at ${job?.company ?? "employer"}: open the employer's application page with your materials ready` });
        });
      const pending = actions.filter((a) => a.status === "pending_confirmation");
      if (pending.length) {
        if (decision === "run") {
          for (const a of pending) {
            a.status = "confirmed";
            a.history.push({ at: new Date().toISOString(), event: "confirmed", detail: "Auto-confirmed by your automation policy (Autonomous)" });
          }
        } else {
          await ctx.requestUser(`${pending.length} application${pending.length === 1 ? " is" : "s are"} ready to hand off. Approve and Wonder opens the employer's page with your materials — you press submit.`);
        }
      }
      // Continuing without deciding is a decision: anything still pending is recorded as not approved, never
      // silently carried forward to a later run.
      let notApproved = 0;
      for (const a of actions) {
        const fresh = ctx.run.actions.find((x) => x.id === a.id) ?? a;
        if (fresh.status === "pending_confirmation") {
          fresh.status = "rejected";
          fresh.history.push({ at: new Date().toISOString(), event: "rejected", detail: "Not approved before continuing" });
          notApproved++;
        }
      }
      const handedOff: string[] = [];
      for (const a of actions) {
        const fresh = ctx.run.actions.find((x) => x.id === a.id) ?? a;
        if (fresh.status !== "confirmed") continue;
        await ctx.executeAction(fresh.id, async () => {
          const app = useApplicationsStore.getState().applications[fresh.targetId];
          const job = app ? jobs[app.jobId] : undefined;
          useApplicationsStore.getState().setNextAction(fresh.targetId, `Apply on ${job?.company ?? "the employer"}'s site, then mark as submitted`);
          useApplicationsStore.getState().addEvent(fresh.targetId, { type: "note", title: "Ready to submit", detail: `Materials are final. Open the application page${job?.applyUrl ? ` (${job.applyUrl})` : ""}, submit, then mark this application as submitted so Wonder can track it.` });
        });
        if ((ctx.run.actions.find((x) => x.id === a.id) ?? fresh).status === "succeeded") handedOff.push(fresh.targetId);
        ctx.setProgress(handedOff.length, actions.length);
      }
      const declined = ctx.run.actions.filter((x) => x.status === "rejected").length;
      ctx.setCounts({ handed_off: handedOff.length, declined });
      ctx.addEvidence({ label: "Ready for you to submit", value: String(handedOff.length), tone: handedOff.length ? "success" : "neutral" });
      if (handedOff.length) ctx.addEvidence({ label: "Why not automatic", value: "Employers' forms need your own identity and consent; Wonder prepares everything and hands off.", tone: "info" });
      if (declined) ctx.addEvidence({ label: "Declined or not approved", value: String(declined), tone: notApproved ? "warning" : "neutral" });
      if (notApproved) ctx.warn(`${notApproved} hand-off${notApproved === 1 ? " was" : "s were"} not approved before continuing. Open the application to submit it yourself, or rerun from this stage.`);
      return { data: { submittedApplicationIds: [], handedOffApplicationIds: handedOff }, counts: { handed_off: handedOff.length } };
    },

    track: async (ctx) => {
      const out = ctx.output<{ submittedApplicationIds: string[]; handedOffApplicationIds?: string[] }>("apply");
      const submitted = out?.submittedApplicationIds ?? [];
      const handedOff = out?.handedOffApplicationIds ?? [];
      await ctx.sleep(0);
      await ctx.checkpoint();
      const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
      for (const id of submitted) {
        useApplicationsStore.getState().addFollowUp(id, { dueAt: due, kind: "follow_up", note: "Follow up if there is no response" });
        useApplicationsStore.getState().setNextAction(id, "Wait for response · follow up in 5 days", due);
      }
      const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
      for (const id of handedOff) {
        useApplicationsStore.getState().addFollowUp(id, { dueAt: soon, kind: "follow_up", note: "Submit this application on the employer's site and mark it as submitted" });
      }
      const total = submitted.length + handedOff.length;
      ctx.setProgress(total, total);
      ctx.addEvidence({ label: "Follow-ups scheduled", value: String(submitted.length) });
      if (handedOff.length) ctx.addEvidence({ label: "Submission reminders", value: String(handedOff.length), tone: "info" });
      return { provenance: "SYSTEM_DERIVED", data: { followUpsScheduled: total } };
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
      // No canned advice: the insight is the model's read of this run; changing preferences stays the candidate's call.
      const suggestion = ctx.policy("change_search_preferences") === "run" ? undefined : { text: "Review your search preferences in light of this?", href: "/app/career-dna" };
      useCareerStore.getState().setInsights([{ id: `ins_${ctx.run.id}`, title: "From this run", body: text, suggestion }, ...useCareerStore.getState().insights.filter((i) => !i.id.startsWith("ins_run")).slice(0, 2)]);
      return { data: { insight: text, topTitles: top } };
    },
  };
}

function providerName(id: string) {
  return { wonderjobs: "WonderWorks AI", anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini" }[id] ?? id;
}

// Per-run working memory for large intermediate results (not persisted).
const lakeCache = new Map<string, { response: SearchResponse; jobs: CanonicalJob[] }>();
const canonicalCache = new Map<string, CanonicalJob[]>();
const matchCache = new Map<string, JobMatch[]>();
const qualityCache = new Map<string, JobQuality[]>();
const rankedCache = new Map<string, string[]>();

/** The candidate's own words, when the run searched for them — what matching judges each posting on first. */
export function typedQuery(config: { origin?: "profile" | "words"; role?: unknown; searchCriteria: { query: string } }): string | undefined {
  return config.origin === "words" && !config.role && config.searchCriteria.query.trim() ? config.searchCriteria.query : undefined;
}

/** Rehydrate working memory for a rerun from the parent run's caches, when available. */
export function inheritCaches(parentRunId: string, childRunId: string) {
  for (const cache of [lakeCache, canonicalCache, matchCache, qualityCache, rankedCache] as Map<string, unknown>[]) {
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

/* ------------------------------------------------------------- WorksLake */

/**
 * Smart search: broader phrasings to search alongside the candidate's words — AI-proposed and checked
 * against their own vocabulary on the server, or the rules alone when that doesn't answer.
 */
async function smartPhrasings(query: string): Promise<{ variants: string[]; fromAi: string[] }> {
  // No words, no phrasings: the search brings the latest listings.
  if (!query.trim()) return { variants: [], fromAi: [] };
  const dna = useCareerStore.getState().dna;
  const profile = { roleWanted: dna.careerGoal.slice(0, 200), headline: dna.headline.slice(0, 200), titles: historyOf(dna).experience.slice(0, 10).map((e) => e.title.slice(0, 120)), skills: dna.skills.slice(0, 25).map((k) => k.name.slice(0, 80)) };
  try {
    const r = await fetch("/api/ai/variants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: query.slice(0, 160), profile }), signal: AbortSignal.timeout(8000) });
    const d = r.ok ? ((await r.json()) as { variants?: unknown; fromAi?: unknown }) : null;
    if (d && Array.isArray(d.variants)) return { variants: d.variants.filter((v): v is string => typeof v === "string").slice(0, MAX_VARIANTS), fromAi: Array.isArray(d.fromAi) ? d.fromAi.filter((v): v is string => typeof v === "string") : [] };
  } catch {
    // fall through to the rules
  }
  return { variants: ruleVariants(query).slice(0, MAX_VARIANTS), fromAi: [] };
}

/**
 * Jobs a running search has found so far, on screen before it ends: listed (the first batch replaces the last
 * search's list) and scored by the same rules the match stage uses, so For you and Strong fill in as sources
 * answer. The rank stage then publishes the finished search, which settles the list and the scores.
 */
function showArriving(ctx: StageContext, jobs: CanonicalJob[], first: boolean) {
  if (!jobs.length) return;
  const role = ctx.run.config.role;
  const list = role ? jobs.map((j) => ({ ...j, foundAs: { id: role.id, title: role.title } })) : jobs;
  const store = useJobsStore.getState();
  if (first) store.replaceCatalog(list, typedQuery(ctx.run.config) ?? "");
  else store.appendCatalog(list);
  const { dna, learnedSignals } = useCareerStore.getState();
  const opts = { dna, preferredLocations: ctx.get<string[]>("preferredLocations"), minSalary: ctx.get<number>("minSalary"), careerGoal: ctx.get<string>("careerGoal"), learnedSignals, searchQuery: typedQuery(ctx.run.config) };
  store.setMatches(list.map((j) => computeMatch(j, opts)));
}

function warnFor(ctx: StageContext, s: SourceSearchStatus) {
  if (s.outcome === "needs_setup") ctx.warn(`${s.sourceName} isn't configured on this deployment yet, so it was skipped.`);
  else if (s.outcome === "timeout" || s.outcome === "unavailable") ctx.warn(`${s.sourceName}: ${s.message ?? "temporarily unavailable"}.`);
}

/**
 * The search stage through WorksLake: streamed when the deployment allows it, so each source's
 * evidence appears the moment that source answers. Returns null when WorksLake is off or failed — the
 * caller then searches each source directly, and the evidence says which path ran.
 */
async function searchWithJobsLake(ctx: StageContext, sourceIds: string[]): Promise<{ response: SearchResponse; jobs: CanonicalJob[] } | null> {
  const phrasings = await smartPhrasings(ctx.run.config.searchCriteria.query);
  await ctx.checkpoint();
  const req = searchRequestFor({ ...ctx.run.config.searchCriteria, variants: phrasings.variants }, sourceIds, "balanced", 500);

  const abort = new AbortController();
  // Stop ends the request at once: the search doesn't wait for WorksLake's next answer to notice.
  const onStop = () => abort.abort();
  ctx.stopSignal.addEventListener("abort", onStop, { once: true });
  let control: unknown = null;
  let shown = 0;
  const onEvent = async (e: SearchEvent) => {
    try {
      await ctx.checkpoint();
    } catch (sig) {
      control = sig;
      abort.abort();
      throw sig;
    }
    if (e.type === "search_started") {
      ctx.addEvidence({ label: "Searched with", value: req.latest ? "WorksLake · latest stored jobs" : `WorksLake · ${e.plannedSources.length} sources planned`, tone: "info" });
      // Only once WorksLake is searching them: the direct fallback path searches the candidate's words alone.
      const said = phrasingEvidence(phrasings.variants, phrasings.fromAi);
      if (said) ctx.addEvidence(said);
    }
    else if (e.type === "results_preview") {
      showArriving(ctx, e.results.map(toCanonicalJob), shown === 0);
      shown += e.results.length;
    } else if (e.type === "jobs_retrieved") {
      ctx.setProgress(e.totalRetrieved, null);
      ctx.setCounts({ discovered: e.totalRetrieved });
    } else if (e.type === "source_completed") {
      const ev = sourceEvidence(e.status);
      if (ev) ctx.addEvidence(ev);
      warnFor(ctx, e.status);
    }
  };
  const attempt = async (): Promise<SearchResponse> => {
    if (jobsLakeCapability().streaming) {
      try {
        return await searchJobsStream(req, onEvent, abort.signal);
      } catch (e) {
        // Streaming alone may be switched off; the plain search still answers.
        if (!(e instanceof JobsLakeError && e.body?.code === "FEATURE_DISABLED")) throw e;
        setJobsLakeCapability({ streaming: false });
      }
    }
    const r = await searchJobs(req, abort.signal);
    await onEvent({ type: "search_started", requestId: r.requestId, plannedSources: r.sources.map((x) => ({ id: x.sourceId, name: x.sourceName })), searchMode: r.searchMode });
    for (const status of r.sources) await onEvent({ type: "source_completed", status });
    return r;
  };
  let response: SearchResponse;
  try {
    response = await attempt();
  } catch (e) {
    if (control) throw control;
    // Stopped mid-request: the run stops here, never falls back to searching each source directly.
    if (ctx.stopSignal.aborted) {
      await ctx.checkpoint();
      throw new StopSignal();
    }
    if (e instanceof StopSignal || e instanceof RestartSignal) throw e;
    const disabled = e instanceof JobsLakeError && e.body?.code === "FEATURE_DISABLED";
    if (disabled) setJobsLakeCapability({ search: false });
    ctx.addEvidence({ label: "WorksLake", value: disabled ? "Off" : "Didn't answer", tone: "warning" });
    if (!disabled) ctx.warn(`WorksLake didn't answer (${e instanceof Error ? e.message : "unknown error"}).`);
    return null;
  }
  ctx.stopSignal.removeEventListener("abort", onStop);
  for (const ev of breadthEvidence(response.metadata)) ctx.addEvidence(ev);
  return { response, jobs: response.results.map(toCanonicalJob) };
}
