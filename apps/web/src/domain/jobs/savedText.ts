import type { Job } from "./types";

/**
 * Saved's box filters the saved jobs as the words are typed (owner, 2026-10-22): every word, or the start
 * of it, appears in the job's title, company, place, skills or tags — "int" finds "Interactive Brokers"
 * and "Intern". A plain look-up, not Find's search: no word forms, no place or pay words read out.
 */
export function savedTextMatches(job: Pick<Job, "title" | "company" | "location" | "skills" | "tags">, text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [job.title, job.company, job.location, ...(job.skills ?? []), ...(job.tags ?? [])].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
