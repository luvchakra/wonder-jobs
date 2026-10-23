import type { CareerDNA } from "@/domain/career/types";
import { historyOf, sortExperience } from "@/domain/career/history";
import { LEARN_PLATFORMS } from "@/domain/skills/learn";

/** The posting fields interview prep reads — present on a search result and on an application's own copy. */
export interface PrepJob {
  title: string;
  company: string;
  skills?: string[];
  requirements?: string[];
  niceToHave?: string[];
}

/** A line from the candidate's own work history that speaks to a skill: their story, in their words. */
export interface PrepStory {
  text: string;
  role: string;
}

export interface InterviewPrep {
  /** The posting's requirements, as written. */
  lookingFor: string[];
  niceToHave: string[];
  /** Skills the posting lists that the candidate has, strongest first, with a line from their history when one mentions it. */
  leadWith: { skill: string; level: number; story?: PrepStory }[];
  /** Skills the posting lists that the Career Profile doesn't: the candidate prepares an example, or how they'd close the gap. */
  gaps: { skill: string; story?: PrepStory }[];
  /** Practice questions, each from one of the posting's requirements; the last two are about this company and role. */
  questions: { q: string; from?: string }[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();

function mentions(text: string, skill: string) {
  const t = ` ${norm(text)} `;
  const s = norm(skill);
  return !!s && t.includes(` ${s} `);
}

/** The first bullet of the candidate's recorded roles (newest first) that mentions the skill. */
function storyFor(dna: CareerDNA, skill: string): PrepStory | undefined {
  for (const r of sortExperience(historyOf(dna).experience)) {
    const b = r.bullets.find((x) => mentions(x.text, skill));
    if (b)
      return {
        text: b.text,
        role: [r.title, r.employer].filter(Boolean).join(" at "),
      };
  }
  return undefined;
}

/** A requirement as a practice question, without changing its words. */
function asQuestion(req: string) {
  const r = req.trim().replace(/[.;:]+$/, "");
  return `Can you give an example that shows this: “${r.charAt(0).toLowerCase()}${r.slice(1)}”?`;
}

/**
 * Interview prep for one application, built only from the posting and the candidate's own Career Profile —
 * nothing generated, nothing assumed. A posting with no requirements gives no requirement questions.
 */
export function interviewPrep(job: PrepJob, dna: CareerDNA): InterviewPrep {
  const skills = [...new Set((job.skills ?? []).map((s) => s.trim()).filter(Boolean))];
  const mine = new Map(dna.skills.map((s) => [norm(s.name), s.level]));
  const leadWith = skills
    .filter((s) => mine.has(norm(s)))
    .map((skill) => ({
      skill,
      level: mine.get(norm(skill))!,
      story: storyFor(dna, skill),
    }))
    .sort((a, b) => b.level - a.level);
  const gaps = skills.filter((s) => !mine.has(norm(s))).map((skill) => ({ skill, story: storyFor(dna, skill) }));
  const lookingFor = (job.requirements ?? []).map((r) => r.trim()).filter(Boolean);
  const questions = [...lookingFor.slice(0, 6).map((r) => ({ q: asQuestion(r), from: r })), { q: `Why ${job.company}, and why this ${job.title} role?` }, { q: "What questions do you have for us?" }];
  return {
    lookingFor,
    niceToHave: (job.niceToHave ?? []).map((r) => r.trim()).filter(Boolean),
    leadWith,
    gaps,
    questions,
  };
}

/**
 * Where to learn before the interview: the platforms' own search pages for the skills to brush up on (gaps
 * first, then the strongest matches), and searches for this company's interviews. Links, not claims about
 * particular courses — what each site lists is its own.
 */
export function learnLinks(prep: InterviewPrep, job: Pick<PrepJob, "title" | "company">): { topic: string; links: { name: string; href: string }[] }[] {
  const enc = encodeURIComponent;
  const terms = [...prep.gaps.map((g) => g.skill), ...prep.leadWith.map((s) => s.skill)].slice(0, 4);
  const platforms = LEARN_PLATFORMS.filter((p) => ["coursera", "linkedin", "youtube"].includes(p.id));
  return [
    {
      topic: `Interviews at ${job.company}`,
      links: [
        {
          name: "Glassdoor",
          href: `https://www.glassdoor.com/Search/results.htm?keyword=${enc(`${job.company} interview`)}`,
        },
        {
          name: "YouTube",
          href: `https://www.youtube.com/results?search_query=${enc(`${job.title} interview questions`)}`,
        },
        {
          name: "Web",
          href: `https://www.google.com/search?q=${enc(`${job.company} ${job.title} interview questions`)}`,
        },
      ],
    },
    ...terms.map((t) => ({
      topic: t,
      links: platforms.map((p) => ({ name: p.name, href: p.href(t) })),
    })),
  ];
}
