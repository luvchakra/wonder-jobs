/**
 * Stage executors for the Run Wonder workflow. Each does real work on real
 * data (mock sources, deterministic AI) and reports progress through the
 * engine context — the UI only ever renders engine state.
 */
import { RestartSignal, StopSignal, type StageContext, type StageExecutor } from "@/domain/workflow/engine";
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
import { getClientMode } from "@/lib/mode";
import type { SearchEvent, SearchResponse, SourceSearchStatus } from "@/domain/jobslake/protocol";
import { breadthEvidence, contributionBySource, searchRequestFor, sourceEvidence, toCanonicalJob } from "@/domain/jobslake/wonderjobs";
import { JobsLakeError, reportContribution, searchJobs, searchJobsStream } from "@/services/jobs/jobsLakeClient";
import { jobsLakeCapability, setJobsLakeCapability } from "@/services/jobs/jobsLakeMode";

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
      ctx.setProgress(0, null);
      // Signed in: search through JobsLake — one request, every source, deduplicated with provenance.
      // If JobsLake is off or doesn't answer, the direct per-source path below runs instead, and says so.
      if (getClientMode().mode === "user" && jobsLakeCapability().search && enabled.length) {
        const lake = await searchWithJobsLake(ctx, enabled.map((s) => s.id));
        if (lake) {
          lakeCache.set(ctx.run.id, lake);
          rawCache.delete(ctx.run.id);
          const m = lake.response.metadata;
          const discovered = m.retrieved + m.warm;
          ctx.setProgress(discovered, discovered);
          if (!lake.jobs.length) {
            const failed = lake.response.sources.filter((x) => x.outcome === "timeout" || x.outcome === "unavailable").map((x) => x.sourceName);
            const allFailed = failed.length > 0 && m.sourcesSucceeded === 0;
            ctx.fail({ category: allFailed ? "recoverable" : "user_action_required", message: allFailed ? `All sources failed (${failed.join(", ")}). Retry in a moment.` : "No jobs matched your search. Widen the query or locations.", actions: ["retry", "fix_config", "stop"] });
          }
          const perSource = Object.fromEntries(lake.response.sources.filter((x) => x.outcome === "ok" || x.outcome === "empty").map((x) => [x.sourceId, x.retrieved]));
          return { data: { jobIds: lake.jobs.map((j) => j.id), perSource, searchedWith: "JobsLake", requestId: lake.response.requestId }, counts: { discovered, sources: m.sourcesSucceeded } };
        }
      }
      lakeCache.delete(ctx.run.id);
      const discovered: Job[] = [];
      const perSource: Record<string, number> = {};
      const failures: string[] = [];
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
            if (e.kind === "needs_setup") {
              ctx.addEvidence({ label: src.name, value: "Needs setup", tone: "warning" });
              ctx.warn(`${src.name} isn't configured on this deployment yet, so it was skipped.`);
            } else {
              failures.push(src.name);
              ctx.addEvidence({ label: src.name, value: "Unavailable", tone: "danger" });
              ctx.warn(`${src.name} is temporarily unavailable: ${e.message}`);
            }
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
      const lake = lakeCache.get(ctx.run.id);
      if (lake) {
        // JobsLake already merged cross-posted duplicates (by apply URL, identity and content), keeping every sighting.
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
      }
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
      const { dna, learnedSignals } = useCareerStore.getState();
      const preferredLocations = ctx.get<string[]>("preferredLocations");
      const minSalary = ctx.get<number>("minSalary");
      const careerGoal = ctx.get<string>("careerGoal");
      const matches: JobMatch[] = [];
      ctx.setProgress(0, jobs.length);
      for (let i = 0; i < jobs.length; i += CHUNK) {
        for (const j of jobs.slice(i, i + CHUNK)) matches.push(computeMatch(j, { dna, preferredLocations, minSalary, careerGoal, learnedSignals }));
        ctx.setProgress(matches.length, jobs.length);
        await ctx.sleep(90);
        await ctx.checkpoint();
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
      await ctx.requestUser(`${ids.length} prepared application${ids.length === 1 ? "" : "s"} are ready. Review them, edit anything you like, then continue.`);
      return { provenance: "USER_PROVIDED", data: { reviewedApplicationIds: ids } };
    },

    apply: async (ctx) => {
      const ids = ctx.output<{ reviewedApplicationIds: string[] }>("review")?.reviewedApplicationIds ?? [];
      const appsState = useApplicationsStore.getState();
      const jobs = useJobsStore.getState().jobs;
      const decision = ctx.policy("submit_application");
      if (decision === "skip") {
        ctx.addEvidence({ label: "Skipped", value: "Submitting applications is turned off in What Wonder can do." });
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
          await ctx.requestUser(`${pending.length} application${pending.length === 1 ? " is" : "s are"} ready to submit. Approve each hand-off; Wonder queues the employer's application page and your materials — you press submit.`);
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
      await ctx.sleep(300);
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
const lakeCache = new Map<string, { response: SearchResponse; jobs: CanonicalJob[] }>();
const canonicalCache = new Map<string, CanonicalJob[]>();
const matchCache = new Map<string, JobMatch[]>();
const qualityCache = new Map<string, JobQuality[]>();
const rankedCache = new Map<string, string[]>();

/** Rehydrate working memory for a rerun from the parent run's caches, when available. */
export function inheritCaches(parentRunId: string, childRunId: string) {
  for (const cache of [rawCache, lakeCache, canonicalCache, matchCache, qualityCache, rankedCache] as Map<string, unknown>[]) {
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

/* ------------------------------------------------------------- JobsLake */

function warnFor(ctx: StageContext, s: SourceSearchStatus) {
  if (s.outcome === "needs_setup") ctx.warn(`${s.sourceName} isn't configured on this deployment yet, so it was skipped.`);
  else if (s.outcome === "timeout" || s.outcome === "unavailable") ctx.warn(`${s.sourceName}: ${s.message ?? "temporarily unavailable"}.`);
}

/**
 * The search stage through JobsLake: streamed when the deployment allows it, so each source's
 * evidence appears the moment that source answers. Returns null when JobsLake is off or failed — the
 * caller then searches each source directly, and the evidence says which path ran.
 */
async function searchWithJobsLake(ctx: StageContext, sourceIds: string[]): Promise<{ response: SearchResponse; jobs: CanonicalJob[] } | null> {
  const req = searchRequestFor(ctx.run.config.searchCriteria, sourceIds, "balanced", 500);
  const abort = new AbortController();
  let control: unknown = null;
  const onEvent = async (e: SearchEvent) => {
    try {
      await ctx.checkpoint();
    } catch (sig) {
      control = sig;
      abort.abort();
      throw sig;
    }
    if (e.type === "search_started") ctx.addEvidence({ label: "Searched with", value: `JobsLake · ${e.plannedSources.length} sources planned`, tone: "info" });
    else if (e.type === "jobs_retrieved") {
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
    if (e instanceof StopSignal || e instanceof RestartSignal) throw e;
    const disabled = e instanceof JobsLakeError && e.body?.code === "FEATURE_DISABLED";
    if (disabled) setJobsLakeCapability({ search: false });
    ctx.addEvidence({ label: "JobsLake", value: disabled ? "Off — searched each source directly" : "Didn't answer — searched each source directly", tone: disabled ? "info" : "warning" });
    if (!disabled) ctx.warn(`JobsLake didn't answer (${e instanceof Error ? e.message : "unknown error"}), so Wonder searched each source directly.`);
    return null;
  }
  for (const ev of breadthEvidence(response.metadata)) ctx.addEvidence(ev);
  return { response, jobs: response.results.map(toCanonicalJob) };
}
