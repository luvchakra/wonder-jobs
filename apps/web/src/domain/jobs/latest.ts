import type { WorkflowRun } from "@/domain/workflow/types";

/**
 * What `searchedFor` holds for Part Time's search with an empty box: the latest part-time jobs (owner, 2026-11-01: an
 * empty search shows the latest listings, never an error). Not a query: nobody types it (it starts with an invisible
 * separator), and `wordsQuery` keeps it out of matching.
 */
export const LATEST_WORDS = "\u2063latest";

/** The words a catalog was searched for, for matching and display: none for the profile's search or Part Time's latest. */
export const wordsQuery = (searchedFor: string): string | undefined => (searchedFor && searchedFor !== LATEST_WORDS ? searchedFor : undefined);

/**
 * The catalog a run fills (`searchedFor`): the typed words of a words search; LATEST_WORDS for a words search with
 * none (Part Time's empty box); "" for the profile's own search and a role's.
 */
export function catalogKey(config: Pick<WorkflowRun["config"], "origin" | "role" | "searchCriteria">): string {
  if (config.origin !== "words" || config.role) return "";
  return config.searchCriteria.query.trim() || LATEST_WORDS;
}
