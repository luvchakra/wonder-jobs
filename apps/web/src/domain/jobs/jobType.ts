/**
 * What kind of engagement a posting is — full-time, part-time, a contract, an internship, short-term
 * work or a gig (owner, 2026-10-18). Read from what the source itself reports (Lever's commitment,
 * Ashby's and Himalayas' employment type, Adzuna's contract time…); when a source says nothing, from
 * the posting's own title ("Part-time Barista", "Freelance designer") and marked as read from the title.
 * Never assumed: a posting that says neither has no job type, not "Full-time".
 */
export type JobType = "full_time" | "part_time" | "contract" | "internship" | "temporary" | "gig";

export const JOB_TYPES: JobType[] = ["full_time", "part_time", "contract", "internship", "temporary", "gig"];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Short-term",
  gig: "Gig",
};

/** Where a job type came from: the source's own field, or the posting's title. */
export type JobTypeFrom = "source" | "title";

// Most specific first: "part-time contract" is part-time; "freelance contract" is a gig.
const RULES: [JobType, RegExp][] = [
  ["internship", /\b(intern|interns|internship|trainee(ship)?|apprentice(ship)?|werkstudent|working student)\b/i],
  ["gig", /\b(gig|gigs|freelance[rd]?|freelancing|fixed[- ]price|hourly project|per project|task[- ]based|odd jobs?)\b/i],
  ["part_time", /\b(part[\s_-]?time|parttime|teilzeit|minijob|half[- ]day|weekend (job|shifts?|work)|few hours)\b/i],
  ["temporary", /\b(temporary|temp|seasonal|short[\s_-]?term|fixed[\s_-]?term|interim|one[- ]off|locum|befristet|holiday cover|maternity cover)\b/i],
  ["contract", /\b(contract|contractor|contractual|consultant basis|c2c|corp[- ]to[- ]corp|1099)\b/i],
  ["full_time", /\b(full[\s_-]?time|fulltime|vollzeit|permanent|regular)\b/i],
];

/** "Contract Manager", "Contracts Analyst": contracts are the job, not its terms. */
const CONTRACT_FIELD = /^contracts?\s+(manag|admin|specialist|analyst|negotiat|lawyer|attorney|counsel|officer|coordinator|lead|executive|associate|director|engineer(ing)? manager)/i;

function classify(text: string): JobType | undefined {
  for (const [type, re] of RULES) if (re.test(text)) return type;
  return undefined;
}

/**
 * A source's own employment-type field ("Part Time", "FullTime", "part_time", ["full-time", "contract"])
 * as a job type, or undefined when it names none we recognise. Several values: the most specific wins.
 */
export function readJobType(reported: string | readonly (string | null | undefined)[] | null | undefined): JobType | undefined {
  const values = (Array.isArray(reported) ? reported : [reported]).filter((v): v is string => typeof v === "string" && !!v.trim());
  if (!values.length) return undefined;
  // "FullTime" / "PartTime" (Ashby) read as two words.
  const text = values.map((v) => v.replace(/([a-z])([A-Z])/g, "$1 $2")).join(" | ");
  return classify(text);
}

/**
 * Only a title that says so outright: "Part-time", "Freelance", "Intern", "Temporary", "Contract".
 * The description isn't read — "full-time equivalent" or "contract management" there says nothing about the job.
 */
export function jobTypeFromTitle(title: string): JobType | undefined {
  const t = classify(title);
  // "Senior Contract Manager", "Contracts Administrator": a contract word in a title is a role unless it's
  // bracketed or after a dash ("Java Developer (Contract)"), or leads a title it isn't the field of ("Contract Java Developer").
  if (t === "contract") {
    const tt = title.trim();
    const marked = /[([|,–—-]\s*(contract|contractor|contractual)\b/i.test(tt);
    const leads = /^(contract|contractual)\b/i.test(tt) && !CONTRACT_FIELD.test(tt);
    if (!marked && !leads) return undefined;
  }
  if (t === "full_time") return undefined; // a title rarely says full-time; when it does it's noise next to the source's own field
  return t;
}

/** The job type a raw posting reports, else what its title says, with where it came from. */
export function resolveJobType(reported: Parameters<typeof readJobType>[0], title: string): { jobType?: JobType; jobTypeFrom?: JobTypeFrom } {
  const fromSource = readJobType(reported);
  if (fromSource) return { jobType: fromSource, jobTypeFrom: "source" };
  const fromTitle = jobTypeFromTitle(title);
  return fromTitle ? { jobType: fromTitle, jobTypeFrom: "title" } : {};
}

/** A job's type for display and filtering: its own, else (older entries saved before job types) its title's. */
export function jobTypeOf(job: { jobType?: JobType; title: string }): JobType | undefined {
  return job.jobType ?? jobTypeFromTitle(job.title);
}

// What a candidate types: "part time designer jobs", "freelance gigs", "marketing internship", "contract roles".
// "Contract" alone is a field ("contract manager"), so it counts only as "contract jobs/roles/work".
const SEARCH_WORDS: [JobType, RegExp][] = [
  ["part_time", /\bpart[\s-]?time\b/gi],
  ["full_time", /\bfull[\s-]?time\b/gi],
  ["gig", /\b(gigs?|freelance|freelancing)\b/gi],
  ["internship", /\b(internships?|interns?)\b/gi],
  ["temporary", /\b(short[\s-]?term|temporary|seasonal|temp)\b/gi],
  ["contract", /\bcontract(?=\s+(jobs?|roles?|work|positions?|openings?)\b)/gi],
];

/** Job-type words in a search: the types they ask for, and the search without them. */
export function readJobTypeWords(text: string): { types: JobType[]; from: string; rest: string } {
  const types: JobType[] = [];
  const found: string[] = [];
  let rest = text;
  for (const [type, re] of SEARCH_WORDS) {
    const m = rest.match(re);
    if (!m) continue;
    types.push(type);
    found.push(...m);
    rest = rest.replace(re, " ");
  }
  return { types, from: found.join(", "), rest: types.length ? rest.replace(/\s{2,}/g, " ").trim() : text };
}
