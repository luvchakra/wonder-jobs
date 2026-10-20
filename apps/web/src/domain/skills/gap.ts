/**
 * Skill Up's evidence (owner, 2026-10-20): the skills the candidate's well-matched jobs ask for that their
 * Career Profile doesn't show, and the ones they already have that those jobs ask for most. Everything is
 * counted from real postings and the candidate's own skills — nothing assumed about a "typical" role, and a
 * skill is only a gap if postings name it.
 */
export interface GapJob {
  id: string;
  title: string;
  company: string;
  /** The posting's own skill tags. */
  skills: string[];
  /** Its title, requirements and description, where skills it doesn't tag are named. */
  text?: string;
  /** A Strong match (rather than Worth considering). */
  strong?: boolean;
}

export interface SkillGap {
  skill: string;
  /** How many of the considered jobs ask for it. */
  jobs: number;
  /** How many of those are Strong matches. */
  strong: number;
  /** How many tag it as a skill (the rest only name it in their text). */
  tagged: number;
  examples: GapJob[];
  /** One of the skills so common across roles that it says little (see `GENERIC_SKILLS`). */
  generic: boolean;
  /** One of the growth areas the candidate named in their Career Profile. */
  goal: boolean;
}

export interface Strength {
  skill: string;
  jobs: number;
}

export interface GapReport {
  /** How many jobs were compared with the profile. */
  considered: number;
  gaps: SkillGap[];
  /** The candidate's own skills these jobs ask for most — what to lead with. */
  strengths: Strength[];
}

export interface GapOptions {
  max?: number;
  /** Whole-word mention of a skill in posting text (the matcher's own rule). Without it only tags count. */
  mentions?: (text: string, skill: string) => boolean;
  /** Lower-case names of skills too common to say much; they rank after specific ones. */
  generic?: Set<string>;
  /** The candidate's growth areas; a gap among them ranks first. */
  goals?: string[];
  /** Skills the candidate said they don't want to learn; left out. */
  hidden?: string[];
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

/** One skill covers another when they're the same words, or one is a whole-word part of the other ("Python" in "Python programming"). */
export function covers(have: string, skill: string) {
  return have === skill || ` ${have} `.includes(` ${skill} `) || ` ${skill} `.includes(` ${have} `);
}

/** A skill must be asked for by at least this many jobs to count — unless there are too few jobs for that to be fair. */
const MIN_JOBS = 2;
const FEW_JOBS = 5;
/** The skills looked for in posting text: the most-tagged ones across these jobs, enough to cover them, few enough to stay quick. */
const VOCABULARY = 300;

export function skillGaps(have: string[], jobs: GapJob[], opts: GapOptions = {}): GapReport {
  const { max = 8, mentions, generic = new Set<string>(), goals = [], hidden = [] } = opts;
  const unwanted = new Set(hidden.map(norm));
  const mine = have.map((h) => ({ name: h.trim(), key: norm(h) })).filter((h) => h.key);
  const goalKeys = goals.map(norm).filter(Boolean);
  // Broad when it is one of the generic skills or built on one ("Cross-functional Leadership", "Risk Management").
  const broad = [...generic].map(norm).filter(Boolean);
  const isGeneric = (key: string) => broad.some((g) => ` ${key} `.includes(` ${g} `));

  // What these jobs call their skills, by how often they tag them.
  const tagged = new Map<string, { name: string; n: number }>();
  for (const job of jobs) for (const raw of job.skills) {
    const key = norm(raw);
    if (!key) continue;
    const t = tagged.get(key) ?? { name: raw.trim(), n: 0 };
    t.n++;
    tagged.set(key, t);
  }
  const vocabulary = [...tagged.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, VOCABULARY);

  const found = new Map<string, SkillGap>();
  const strengths = new Map<string, Strength>();
  for (const job of jobs) {
    const text = (job.text ?? "").toLowerCase();
    const tags = new Set(job.skills.map(norm).filter(Boolean));
    const asked = new Set(tags);
    // A skill the posting names in its text but doesn't tag still counts — only when it's a skill these jobs use as one.
    if (mentions && text) for (const [key, t] of vocabulary) if (!asked.has(key) && mentions(text, t.name)) asked.add(key);
    for (const h of mine) {
      if ([...asked].some((k) => covers(h.key, k)) || (mentions && text && mentions(text, h.name))) {
        const s = strengths.get(h.key) ?? { skill: h.name, jobs: 0 };
        s.jobs++;
        strengths.set(h.key, s);
      }
    }
    for (const key of asked) {
      if (unwanted.has(key) || mine.some((h) => covers(h.key, key))) continue;
      const gap = found.get(key) ?? { skill: tagged.get(key)?.name ?? key, jobs: 0, strong: 0, tagged: 0, examples: [], generic: isGeneric(key), goal: goalKeys.some((g) => covers(g, key)) };
      gap.jobs++;
      if (job.strong) gap.strong++;
      if (tags.has(key)) gap.tagged++;
      if (gap.examples.length < 3) gap.examples.push(job);
      found.set(key, gap);
    }
  }
  const enough = jobs.length < FEW_JOBS ? 1 : MIN_JOBS;
  // The candidate's own goals first, then specific skills before generic ones, then by how much they'd help:
  // a Strong match asking for it counts twice.
  const weight = (g: SkillGap) => g.jobs + g.strong;
  const gaps = [...found.values()]
    .filter((g) => g.jobs >= enough)
    .sort((a, b) => Number(b.goal) - Number(a.goal) || Number(a.generic) - Number(b.generic) || weight(b) - weight(a) || a.skill.localeCompare(b.skill))
    .slice(0, max);
  const top = [...strengths.values()].sort((a, b) => b.jobs - a.jobs || a.skill.localeCompare(b.skill)).slice(0, 6);
  return { considered: jobs.length, gaps, strengths: top };
}
