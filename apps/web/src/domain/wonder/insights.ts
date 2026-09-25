import type { CareerDNA } from "@/domain/career/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";

export interface MissingSkill {
  name: string;
  /** How many of the candidate's own strong/worth-considering matches ask for it. */
  count: number;
}

/**
 * Skills that show up in the candidate's own strong-or-worth-considering matches but aren't in
 * their Career DNA yet — derived only from jobs already in their catalog, never a canned
 * "learn X" list unrelated to what they're actually being matched against.
 */
export function computeMissingSkills(dna: Pick<CareerDNA, "skills">, jobs: CanonicalJob[], matches: Record<string, JobMatch>, limit = 5): MissingSkill[] {
  const mine = new Set(dna.skills.map((s) => s.name.toLowerCase()));
  const counts = new Map<string, MissingSkill>();
  for (const job of jobs) {
    const m = matches[job.id];
    if (!m || (m.fit !== "strong" && m.fit !== "worth_considering")) continue;
    for (const skill of job.skills) {
      const key = skill.toLowerCase();
      if (mine.has(key)) continue;
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { name: skill, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds the candidate's own job by a title/company substring — real catalog lookup, never fuzzy AI
 * matching. The most specific match wins: a named company beats a title, and a longer title beats a
 * shorter one it contains, so "the Senior Product Manager, Platform role" finds that role rather than
 * the first plain "Product Manager" in the catalog. A whole-word boundary keeps a short company name
 * (e.g. "Co") from matching an unrelated word that merely contains those letters (e.g. "company").
 */
export function findJobBySubject(order: string[], jobs: Record<string, CanonicalJob>, subject: string): CanonicalJob | undefined {
  const q = subject.trim().toLowerCase();
  if (!q) return undefined;
  let best: CanonicalJob | undefined;
  let bestScore = 0;
  for (const id of order) {
    const job = jobs[id];
    if (!job) continue;
    const title = job.title.toLowerCase();
    const company = job.company.toLowerCase();
    const companyHit = new RegExp(`\\b${escapeRegExp(company)}\\b`).test(q);
    const titleHit = q.includes(title) ? title.length : title.includes(q) ? q.length : 0;
    const score = (companyHit ? 1000 : 0) + titleHit;
    if (score > bestScore) {
      best = job;
      bestScore = score;
    }
  }
  return best;
}
