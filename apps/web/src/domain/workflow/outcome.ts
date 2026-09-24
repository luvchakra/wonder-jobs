import type { WorkflowRun } from "./types";
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
    const actions: OutcomeAction[] = [];
    if (ranked > 0) actions.push({ label: "See what was found", showResults: true, primary: true });
    actions.push({ label: "Search again", href: "/app/runs/new", primary: actions.length === 0 });
    return {
      tone: "info",
      eyebrow: run.status === "CANCELLED" ? "Search cancelled" : "Search stopped",
      title: run.status === "CANCELLED" ? "Cancelled before it started" : "Search stopped",
      body: run.status === "CANCELLED" ? "Nothing ran, so nothing changed." : `Everything already found is still available${ranked > 0 ? `, including ${plural(ranked, "shortlisted role")}` : ""}.`,
      actions,
    };
  }

  if (handedOff > 0) {
    return {
      tone: "success",
      eyebrow: "Your move",
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
      eyebrow: "Applications ready",
      title: `${plural(preparedIds.length, "application")} ready for your review`,
      body: `${quiet}${fitLine} Review the tailored resume, cover letter and screening answers and edit anything. Nothing goes to an employer until you continue to their site yourself — the final action is yours.${declined ? ` ${plural(declined, "hand-off")} ${declined === 1 ? "was" : "were"} declined.` : ""}`,
      actions: [
        { label: preparedIds.length === 1 ? "Review the application" : "Review applications", href: preparedIds.length === 1 ? `/app/applications/${preparedIds[0]}/prepare` : "/app/applications?tab=in_progress", primary: true },
        { label: "See the shortlist", showResults: true },
      ],
    };
  }

  if (s.jobsDiscovered === 0) {
    return {
      tone: "warning",
      eyebrow: "Nothing found",
      title: query ? `No jobs came back for “${query}”` : "No jobs came back from your sources",
      body: `${quiet}Your sources returned nothing for this search. “See how Wonder worked” shows each source's result — some need setup. Try a broader role, more locations or other work modes.`,
      actions: [{ label: "Change the search", href: "/app/runs/new", primary: true }],
    };
  }

  if (ranked === 0) {
    return {
      tone: "warning",
      eyebrow: "No strong fits yet",
      title: `${plural(s.jobsRetained || s.jobsDiscovered, "job")} read, none scored above your minimum match of ${threshold}`,
      body: `${quiet}Nothing was shortlisted, but every job is still in Jobs to browse. For better fits next time, lower the minimum match, widen locations or work modes, or update your Career Profile so Wonder compares roles with what you actually do.`,
      actions: [
        { label: `Browse all ${plural(s.jobsRetained || s.jobsDiscovered, "job")}`, href: "/app/jobs", primary: true },
        { label: "Update Career Profile", href: "/app/career-dna" },
        { label: "Adjust the search", href: "/app/runs/new" },
      ],
    };
  }

  if (!preparesMaterials) {
    const strong = s.strongMatches;
    const total = s.jobsRetained || s.jobsDiscovered;
    return {
      tone: strong > 0 ? "success" : "info",
      eyebrow: "Your search is ready",
      title: strong > 0 ? `${plural(strong, "strong opportunity", "strong opportunities")} worth your attention` : `No strong fits, but ${plural(ranked, "role")} worth a look`,
      body: `${quiet}Wonder found ${plural(total, "opportunity", "opportunities")} and put the ones that fit you first. Open one to see why it fits, then prepare an Application Pack when you're ready.`,
      actions: [
        strong > 0 ? { label: "See what deserves your attention", href: "/app/jobs?fit=strong", primary: true } : { label: "See what deserves your attention", showResults: true, primary: true },
        { label: "Explore all results", href: "/app/jobs" },
      ],
    };
  }

  return {
    tone: "info",
    eyebrow: "Your search is ready",
    title: `${plural(ranked, "role")} shortlisted, nothing prepared`,
    body: `${quiet}Wonder couldn't prepare application packs this time — “See how Wonder worked” shows why. You can still prepare any shortlisted role yourself.`,
    actions: [
      { label: "See the shortlist", showResults: true, primary: true },
      { label: "Search again", href: "/app/runs/new" },
    ],
  };
}
