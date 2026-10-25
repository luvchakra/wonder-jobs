import { handedOffAt, type Application } from "./types";

/** Pipeline → Preparing's filters: whether a customized résumé was made for the job, and whether Apply was opened. */
export type PrepFacet = "resume" | "no_resume" | "opened" | "not_opened";

export const PREP_FACETS: { facet: PrepFacet; label: string }[] = [
  { facet: "resume", label: "Résumé made" },
  { facet: "no_resume", label: "No résumé yet" },
  { facet: "opened", label: "Apply opened" },
  { facet: "not_opened", label: "Not opened" },
];

/**
 * The facets one application being prepared holds. `resumeJobs`: the jobs a customized résumé was saved for
 * (My Resume); a résumé drafted in its Application Pack counts too. `applyOpenedAt`: when Apply was opened, per job.
 */
export function prepFacets(a: Pick<Application, "jobId" | "artifacts" | "events">, resumeJobs: ReadonlySet<string>, applyOpenedAt: Readonly<Record<string, string>>): PrepFacet[] {
  const resume = resumeJobs.has(a.jobId) || a.artifacts.some((x) => x.type === "resume");
  const opened = Boolean(applyOpenedAt[a.jobId] || handedOffAt(a));
  return [resume ? "resume" : "no_resume", opened ? "opened" : "not_opened"];
}

/** The facets worth a chip: each one that splits the list (some have it, not all). */
export function splitFacets(facets: PrepFacet[][]): PrepFacet[] {
  return PREP_FACETS.map((f) => f.facet).filter((f) => {
    const n = facets.filter((x) => x.includes(f)).length;
    return n > 0 && n < facets.length;
  });
}
