/**
 * Skill Up's evidence (owner, 2026-10-20): the skills the candidate's well-matched jobs ask for that their
 * Career Profile doesn't show. Everything is counted from real postings and the candidate's own skills —
 * nothing assumed about a "typical" role, and a skill is only a gap if postings name it.
 */
export interface GapJob {
  id: string;
  title: string;
  company: string;
  skills: string[];
}

export interface SkillGap {
  skill: string;
  /** How many of the considered jobs name it. */
  jobs: number;
  examples: GapJob[];
}

export interface GapReport {
  /** How many jobs were compared with the profile. */
  considered: number;
  gaps: SkillGap[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

/** One skill covers another when they're the same words, or one is a whole-word part of the other ("Python" in "Python programming"). */
function covers(have: string, skill: string) {
  return have === skill || ` ${have} `.includes(` ${skill} `) || ` ${skill} `.includes(` ${have} `);
}

/** A skill must be asked for by at least this many jobs to count — unless there are too few jobs for that to be fair. */
const MIN_JOBS = 2;
const FEW_JOBS = 5;

export function skillGaps(have: string[], jobs: GapJob[], max = 8): GapReport {
  const mine = have.map(norm).filter(Boolean);
  const found = new Map<string, SkillGap>();
  for (const job of jobs) {
    const seen = new Set<string>();
    for (const raw of job.skills) {
      const key = norm(raw);
      if (!key || seen.has(key) || mine.some((h) => covers(h, key))) continue;
      seen.add(key);
      const gap = found.get(key) ?? { skill: raw.trim(), jobs: 0, examples: [] };
      gap.jobs++;
      if (gap.examples.length < 3) gap.examples.push(job);
      found.set(key, gap);
    }
  }
  const enough = jobs.length < FEW_JOBS ? 1 : MIN_JOBS;
  const gaps = [...found.values()].filter((g) => g.jobs >= enough).sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill)).slice(0, max);
  return { considered: jobs.length, gaps };
}
