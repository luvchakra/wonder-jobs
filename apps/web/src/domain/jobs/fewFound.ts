import type { JobMatch } from "./types";

/**
 * Few jobs that fit (owner, 2026-11-26: "Yes, say it and fold"). When a role's or typed search has fewer than `FEW`
 * jobs above a low fit, the results line says so plainly, with the real count and how many sources were searched,
 * and the low fits fold under "Show N more" — rather than filling the list with jobs that aren't what was searched.
 */
export const FEW = 5;

/** The jobs above a low fit (unscored ones count as above), and how many low fits fold; null when there are enough. */
export function fewFound(ids: string[], fitOf: (id: string) => JobMatch["fit"] | undefined): { kept: string[]; folded: number } | null {
  const kept = ids.filter((id) => fitOf(id) !== "low_fit");
  const folded = ids.length - kept.length;
  return kept.length < FEW && folded > 0 ? { kept, folded } : null;
}

/** The results line for it: every number is a count of what's on screen or of the sources the search asked. */
export function fewLine(words: string, found: number, sources: number): string {
  // The count first, so a phone's one line (cut short) still shows it; the whole line is its title.
  const what = words.trim() ? ` “${words.trim()}”` : " this search";
  const searched = ` · searched ${sources} ${sources === 1 ? "source" : "sources"}`;
  return found ? `Only ${found} ${found === 1 ? "job fits" : "jobs fit"}${what} in your sources right now${searched}` : `No jobs fit${what} well in your sources right now${searched}`;
}
