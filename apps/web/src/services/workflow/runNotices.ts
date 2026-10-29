/**
 * The bell's words for a run's events (notification use cases N01–N08), kept pure so each can be tested on its own.
 * `away` is whether the candidate left Find while their search ran: the bell is how they'll hear.
 */
import { foundNothing } from "@/domain/jobs/readiness";
import type { WorkflowRun } from "@/domain/workflow/types";
import type { Notification } from "@/domain/career/types";

export type RunNotice = Omit<Notification, "id" | "at" | "read">;

/** How a search the candidate started went, as one actionable notification. Distinct per query, so searches don't fold into one. */
export function searchFinishedNotice(run: Pick<WorkflowRun, "id" | "summary" | "config">): RunNotice {
  const q = run.config.searchCriteria.query.trim();
  const what = q ? ` for “${q}”` : "";
  const { strongMatches: strong, jobsRetained: found } = run.summary;
  if (strong) return { category: "strong_opportunity", title: `${strong} strong match${strong === 1 ? "" : "es"}${what}`, body: `Out of ${found} job${found === 1 ? "" : "s"} found. The best fits are at the top.`, href: "/app/jobs?fit=strong", action: "Review matches" };
  if (found) return { category: "workflow_completed", title: `${found} job${found === 1 ? "" : "s"} found${what}`, body: "None is a strong match yet; the closest are at the top.", href: "/app/jobs", action: "See jobs" };
  return { category: "workflow_completed", title: `No jobs found${what}`, body: "Try fewer words or more places.", href: `/app/runs/${run.id}`, action: "Change search" };
}

/** A stage waits for the candidate (N04). */
export const waitingNotice = (run: Pick<WorkflowRun, "id">, message: string): RunNotice => ({ category: "workflow_requires_input", title: "Wonder needs your input", body: message, href: `/app/runs/${run.id}` });

/** A run finished (N01, N06, N07): a search they started only when they've moved on; a scheduled one only when its notify setting asks. */
export function completedRunNotice(run: WorkflowRun, away: boolean): RunNotice | null {
  const strong = run.summary.strongMatches;
  if (run.trigger !== "schedule") return away ? searchFinishedNotice(run) : null;
  // Silence is a valid outcome for a scheduled search: only notify when there is something worth attention.
  if (run.silent || !(run.config.notify === "always" || (run.config.notify === "strong_matches_only" && strong > 0))) return null;
  return { category: strong ? "strong_opportunity" : "workflow_completed", title: strong ? `${strong} new strong match${strong === 1 ? "" : "es"}` : "Search finished", body: strong ? "Wonder found roles that fit your Career Profile." : "Nothing new worth your attention this time.", href: strong ? "/app/jobs?fit=strong" : `/app/runs/${run.id}` };
}

/** A run failed (N02, N03, N08). Nothing listed for it isn't a failure: Find says "Nothing found"; a schedule says so only if asked to every time. */
export function failedRunNotice(run: WorkflowRun, message: string, away: boolean): RunNotice | null {
  if (foundNothing(run)) {
    const tell = run.trigger === "schedule" ? run.config.notify === "always" && !run.silent : away;
    return tell ? { category: "workflow_completed", title: `Nothing found for “${run.config.searchCriteria.query}”`, body: "No source listed a matching job. Try other words, or fewer of them.", href: `/app/runs/${run.id}` } : null;
  }
  return { category: run.error?.source && run.error.source !== "wonderjobs" ? "provider_issue" : "scheduled_run_failed", title: "Run needs attention", body: message, href: `/app/runs/${run.id}` };
}

/** Their own AI provider failed and they allowed falling back to WonderJobs AI (N05). */
export const fallbackNotice = (reason: string): RunNotice => ({ category: "provider_issue", title: "Switched to WonderWorks AI for one request", body: `${reason} You allowed automatic fallback in AI settings.`, href: "/app/settings/ai" });
