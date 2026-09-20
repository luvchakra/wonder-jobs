import type { WorkflowRun } from "./types";
import { STAGES } from "./stages";
import { isTerminal } from "./status";
import { resolveRunValue } from "./resolve";

export interface OutcomeAction {
  label: string;
  /** Navigate here… */
  href?: string;
  /** …or switch the run page to its Results tab. */
  showResults?: boolean;
  primary?: boolean;
}

export interface RunOutcome {
  tone: "success" | "info" | "warning";
  eyebrow: string;
  title: string;
  body: string;
  actions: OutcomeAction[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/**
 * What a finished run means for the candidate, and the one thing to do next. A run that ends
 * on "Prioritizing opportunities · 0 strong" is a dead end unless the product says so in plain
 * words — this is the single place that translates a terminal run into that sentence plus the
 * action that follows from it. Active runs and failures return null: the controls and the error
 * banner already own those states.
 */
export function describeOutcome(run: WorkflowRun): RunOutcome | null {
  if (!isTerminal(run.status) || run.status === "FAILED") return null;

  const s = run.summary;
  const preparedIds = (run.outputs.prepare?.data.applicationIds as string[] | undefined) ?? [];
  const rankStage = run.stages.find((x) => x.key === "rank");
  // Older/seeded runs recorded only per-fit counts, never the ranked id list.
  const rankedFromCounts = rankStage ? rankStage.counts.ranked ?? (rankStage.counts.strong_matches ?? 0) + (rankStage.counts.worth_considering ?? 0) : 0;
  const ranked = (run.outputs.rank?.data.rankedJobIds as string[] | undefined)?.length ?? Math.max(rankedFromCounts, s.strongMatches);
  const threshold = Number(resolveRunValue(run, "minMatchThreshold").value ?? run.config.minMatchThreshold);
  const preparesMaterials = run.stages.some((x) => x.key === "prepare");
  const handedOff = run.actions.filter((a) => a.status === "succeeded").length;
  const declined = run.actions.filter((a) => a.status === "rejected").length;
  const query = run.config.searchCriteria.query.trim();
  const quiet = run.silent ? "Quiet outcome: the schedule's condition wasn't met, so you weren't notified. " : "";

  if (run.status === "STOPPED" || run.status === "CANCELLED") {
    const at = run.stages.find((x) => x.key === run.currentStage) ?? run.stages.find((x) => x.status !== "COMPLETED" && x.status !== "COMPLETED_WITH_WARNINGS");
    const actions: OutcomeAction[] = [];
    if (ranked > 0) actions.push({ label: "See what was found", showResults: true, primary: true });
    actions.push({ label: "Run again", href: "/app/runs/new", primary: actions.length === 0 });
    return {
      tone: "info",
      eyebrow: run.status === "CANCELLED" ? "Run cancelled" : "Run stopped",
      title: run.status === "CANCELLED" ? "Cancelled before it started" : at ? `Stopped during “${STAGES[at.key].name}”` : "Stopped",
      body: `Everything finished before that point is kept${ranked > 0 ? `, including ${plural(ranked, "shortlisted role")}` : ""}. Use “Rerun from stage” above to pick up where it left off, or start fresh.`,
      actions,
    };
  }

  if (handedOff > 0) {
    return {
      tone: "success",
      eyebrow: "Run complete · your move",
      title: `${plural(handedOff, "application")} handed off — finish submitting`,
      body: `${quiet}Wonder opened the employer's application page with your materials ready. Submit there, then mark each application as submitted so Wonder can track replies and follow-ups.${declined ? ` ${plural(declined, "hand-off")} ${declined === 1 ? "was" : "were"} declined and left as prepared.` : ""}`,
      actions: [
        { label: "Go to applications", href: "/app/applications", primary: true },
        { label: "See the shortlist", showResults: true },
      ],
    };
  }

  if (preparedIds.length > 0) {
    const fitLine = s.strongMatches > 0 ? `${plural(s.strongMatches, "strong match", "strong matches")} among ${plural(ranked, "shortlisted role")}.` : `No role was a strong match, so Wonder prepared the top of the ${plural(ranked, "role")} shortlist instead.`;
    return {
      tone: "success",
      eyebrow: "Run complete · your move",
      title: `${plural(preparedIds.length, "application")} ready for your review`,
      body: `${quiet}${fitLine} Review the tailored resume, cover letter and screening answers, edit anything, then send the ones you like.${declined ? ` ${plural(declined, "hand-off")} ${declined === 1 ? "was" : "were"} declined.` : ""}`,
      actions: [
        { label: preparedIds.length === 1 ? "Review the application" : "Review applications", href: preparedIds.length === 1 ? `/app/applications/${preparedIds[0]}/prepare` : "/app/applications?tab=in_progress", primary: true },
        { label: "See the shortlist", showResults: true },
      ],
    };
  }

  if (s.jobsDiscovered === 0) {
    return {
      tone: "warning",
      eyebrow: "Run complete · nothing found",
      title: query ? `No jobs came back for “${query}”` : "No jobs came back from your sources",
      body: `${quiet}Your sources returned nothing for this search. Open “Searching job sources” in the timeline to see each source's result — some need setup — then broaden the query, locations or work modes and run again.`,
      actions: [{ label: "Change the search and run again", href: "/app/runs/new", primary: true }],
    };
  }

  if (ranked === 0) {
    return {
      tone: "warning",
      eyebrow: "Run complete · no matches",
      title: `${plural(s.jobsRetained || s.jobsDiscovered, "job")} read, none scored above your minimum match of ${threshold}`,
      body: `${quiet}Nothing was shortlisted or prepared. The jobs are still in your catalog to browse. To get matches next time, lower the minimum match, widen locations or work modes, or update your Career DNA so Wonder scores roles against what you actually do.`,
      actions: [
        { label: `Browse all ${plural(s.jobsRetained || s.jobsDiscovered, "job")}`, href: "/app/jobs", primary: true },
        { label: "Refine Career DNA", href: "/app/career-dna" },
        { label: "Adjust and run again", href: "/app/runs/new" },
      ],
    };
  }

  if (!preparesMaterials) {
    const strong = s.strongMatches;
    return {
      tone: strong > 0 ? "success" : "info",
      eyebrow: "Run complete · your move",
      title: strong > 0 ? `${plural(strong, "strong match", "strong matches")} among ${plural(ranked, "shortlisted role")}` : `No strong matches, but ${plural(ranked, "role")} worth a look`,
      body: `${quiet}This workflow stops at ranking, so nothing was prepared. Open a role to prepare materials yourself, or run Wonder in full to have the top matches prepared for you.`,
      actions: [
        strong > 0 ? { label: "See strong matches", href: "/app/jobs?fit=strong", primary: true } : { label: "Browse the shortlist", showResults: true, primary: true },
        { label: "Prepare materials with a full run", href: "/app/runs/new" },
      ],
    };
  }

  return {
    tone: "info",
    eyebrow: "Run complete",
    title: `${plural(ranked, "role")} shortlisted, nothing prepared`,
    body: `${quiet}Open “Preparing application materials” in the timeline to see why. You can still prepare any shortlisted role yourself.`,
    actions: [
      { label: "See the shortlist", showResults: true, primary: true },
      { label: "Run again", href: "/app/runs/new" },
    ],
  };
}
