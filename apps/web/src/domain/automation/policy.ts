/**
 * Automation policy (spec §11–12) and automation levels (spec §7.1).
 * The policy says what Wonder is allowed to do without asking; the level says
 * how much initiative Wonder takes within that policy.
 */
export type RiskClass = "low" | "medium" | "high";

export const CAPABILITIES = [
  "search_jobs",
  "deduplicate",
  "analyze_jobs",
  "rank_opportunities",
  "generate_resume",
  "generate_cover_letter",
  "interview_practice",
  "translate_job",
  "save_jobs",
  "send_recruiter_message",
  "submit_application",
  "fill_application",
  "fill_demographics",
  "fill_work_authorization",
  "fill_declarations",
  "fill_government_ids",
  "final_submit",
  "easy_apply",
  "send_email",
  "change_career_dna",
  "change_search_preferences",
] as const;

/**
 * WonderWorks modules' own capabilities (docs/WONDERWORKS_PLATFORM.md §7: module-namespaced, one gate). Kept out of
 * `CAPABILITIES`, which Jobs' Automation screens list, so the jobs portal shows exactly what it did; each module offers
 * its own setting on its own You tab. `resolveCapability` and `defaultPolicy` cover them like any other.
 */
export const MODULE_CAPABILITIES = ["internships.apply", "teaching.apply", "teaching.book_demo"] as const;

export type Capability = (typeof CAPABILITIES)[number] | (typeof MODULE_CAPABILITIES)[number];
export type PolicyMode = "automatic" | "ask" | "off";

export interface CapabilityMeta {
  key: Capability;
  label: string;
  description: string;
  risk: RiskClass;
  /** External side effect: confirmation, idempotency and audit are mandatory. */
  external: boolean;
  default: PolicyMode;
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  search_jobs: { key: "search_jobs", label: "Search jobs", description: "Query connected job sources for new opportunities.", risk: "low", external: false, default: "automatic" },
  deduplicate: { key: "deduplicate", label: "Deduplicate", description: "Collapse the same role posted on several platforms.", risk: "low", external: false, default: "automatic" },
  analyze_jobs: { key: "analyze_jobs", label: "Analyze jobs", description: "Read postings and extract requirements, seniority and signals.", risk: "low", external: false, default: "automatic" },
  rank_opportunities: { key: "rank_opportunities", label: "Rank opportunities", description: "Order matches by fit with your Career Profile and goals.", risk: "low", external: false, default: "automatic" },
  // "Ask me" by default: each draft is a paid AI call, made when the candidate wants one (owner decision, 2026-10-09).
  generate_resume: { key: "generate_resume", label: "Generate resume", description: "Tailor a resume version for a specific role.", risk: "medium", external: false, default: "ask" },
  generate_cover_letter: { key: "generate_cover_letter", label: "Generate cover letter", description: "Draft a cover letter you can edit before use.", risk: "medium", external: false, default: "ask" },
  // Interview practice (owner, 2026-10-23): an AI call made only when the candidate presses Start on a job's
  // interview prep — that press is the "ask". Off hides the AI practice; nothing leaves WonderJobs.
  interview_practice: { key: "interview_practice", label: "Interview practice", description: "Write a practice test, flashcards and a mock interview for a job you're interviewing for, when you press Start.", risk: "low", external: false, default: "ask" },
  // Translating a job description (owner, 2026-10-25): an AI call made only when the candidate picks a language on a
  // job's page — that pick is the "ask". Off hides the language menu; the posting itself is never changed or stored
  // translated, and a translation is shown as AI-translated beside a way back to the original.
  translate_job: { key: "translate_job", label: "Translate job descriptions", description: "Translate a job's description into a language you pick, when you pick it.", risk: "low", external: false, default: "ask" },
  // Off by default: the saved list is the candidate's own picks (the owner found strong matches filling Saved unasked, 2026-10-09). Strong matches
  // are already one tap away under "Strong"; turning this on adds them to Saved automatically.
  save_jobs: { key: "save_jobs", label: "Save jobs", description: "Add strong matches to your saved list.", risk: "low", external: false, default: "off" },
  // Wonder never contacts a recruiter or sends an email on its own — it has no recruiter address to reach
  // and no code path that does. Each of these describes the real hand-off: Wonder prepares everything and
  // opens/queues it for the candidate's own action. Submitting to an employer is `final_submit` below.
  send_recruiter_message: { key: "send_recruiter_message", label: "Draft a recruiter message", description: "Draft a message for you to send a recruiter yourself.", risk: "high", external: true, default: "ask" },
  submit_application: { key: "submit_application", label: "Hand off application", description: "Open a prepared application on the employer's own site, ready for you to submit.", risk: "high", external: true, default: "ask" },
  // Filling puts the candidate's own facts into an employer's form in the candidate's own browser. It never
  // submits (no code path clicks Submit); "Ask" means the helper waits for "Fill N fields", "Off" means guided
  // copy-and-paste only. Medium risk: values are the candidate's own, and nothing leaves until they submit.
  fill_application: { key: "fill_application", label: "Fill application forms", description: "Put your own profile details, résumé and approved answers into an employer's form in your browser. You review and submit.", risk: "medium", external: false, default: "ask" },
  // The helper presses the employer's final Submit (owner decision WJ-249): only in the candidate's browser,
  // only once every required field holds their own confirmed answer, once per job, audited. Off by default;
  // a per-job / per-application choice (submitDecision in domain/jobs-apply/policy.ts) can turn it on or off.
  // Sensitive questions: off unless the candidate turns a group on (with a confirmation) and saves their own answers.
  fill_demographics: { key: "fill_demographics", label: "Answer equal-opportunity questions", description: "Gender, pronouns, race/ethnicity, veteran and disability status — with the answers you saved. Off unless you turn it on.", risk: "medium", external: false, default: "off" },
  fill_work_authorization: { key: "fill_work_authorization", label: "Answer work-authorization and sponsorship questions", description: "From the countries you said you can work in. Off unless you turn it on.", risk: "medium", external: false, default: "off" },
  fill_declarations: { key: "fill_declarations", label: "Answer legal declarations", description: "Criminal-record questions with your saved answer, and tick the form's consent and agree boxes. Never a signature. Off unless you turn it on.", risk: "medium", external: false, default: "off" },
  fill_government_ids: { key: "fill_government_ids", label: "Enter ID numbers", description: "PAN, Aadhaar, passport and similar numbers you saved — stored encrypted, shown only masked. Off unless you turn it on.", risk: "medium", external: false, default: "off" },
  final_submit: { key: "final_submit", label: "Submit applications", description: "Press the employer's final Submit button for you, once every required field holds your own confirmed answer. Off unless you turn it on — here or for one job.", risk: "high", external: true, default: "off" },
  // The candidate's own press of Easy Apply (a job a company posted on WonderJobs) is what sends; this only decides whether
  // that press sends at once from their Career Profile, résumé and saved answers, or shows them first (owner, 2026-10-28).
  easy_apply: { key: "easy_apply", label: "Send Easy Apply in one tap", description: "When you press Easy Apply, send your Career Profile details, résumé and saved answers to the company at once. Ask me shows them first; Off turns Easy Apply off.", risk: "low", external: true, default: "automatic" },
  // Internships (WJ-418): the student's own press of Apply on an internship a company posted on WonderWorks is what sends;
  // this only decides whether that press sends at once with their Internships profile and résumé, or shows them first.
  "internships.apply": { key: "internships.apply", label: "Send internship applications in one tap", description: "When you press Apply on an internship posted on WonderWorks, send your Internships profile and résumé to the company at once. Ask me shows them first; Off turns it off.", risk: "low", external: true, default: "automatic" },
  // Teaching: the teacher's own press of Apply on an opening a school posted on WonderWorks, and of Request on one of the
  // demo-class slots the school offered, is what sends; these only decide whether that press sends at once or shows
  // what goes first (owner, 2026-10-30: like Easy Apply).
  "teaching.apply": { key: "teaching.apply", label: "Send teaching applications in one tap", description: "When you press Apply on a teaching job posted on WonderWorks, send your Teaching details and résumé to the school at once. Ask me shows them first; Off turns it off.", risk: "low", external: true, default: "automatic" },
  "teaching.book_demo": { key: "teaching.book_demo", label: "Request demo classes in one tap", description: "When you press Request on a demo-class time a school offered, send the request to the school at once. Ask me shows it first; Off turns it off.", risk: "low", external: true, default: "automatic" },
  send_email: { key: "send_email", label: "Draft follow-up email", description: "Draft a follow-up or thank-you email for you to send yourself, then mark it sent.", risk: "high", external: true, default: "ask" },
  change_career_dna: { key: "change_career_dna", label: "Change Career Profile", description: "Update your skills, goals or profile based on what Wonder learns.", risk: "high", external: false, default: "ask" },
  change_search_preferences: { key: "change_search_preferences", label: "Change search preferences", description: "Adjust locations, salary range or filters automatically.", risk: "high", external: false, default: "ask" },
};

export type AutomationPolicy = Record<Capability, PolicyMode>;

export function defaultPolicy(): AutomationPolicy {
  return Object.fromEntries([...CAPABILITIES, ...MODULE_CAPABILITIES].map((c) => [c, CAPABILITY_META[c].default])) as AutomationPolicy;
}

/** The saved policy's schema version. 2 (2026-10-09): save_jobs defaults to off. 3: résumé and cover-letter drafts default to "ask". */
export const POLICY_VERSION = 3;

/**
 * A saved policy brought up to date: capabilities added since take their default, and a version-1 policy
 * still holding save_jobs' old default ("automatic", written whole on first save — never a separate
 * choice before this change) moves to the new default, off.
 */
export function migratePolicy(saved: Partial<AutomationPolicy> | undefined, version: number): AutomationPolicy {
  const out = { ...defaultPolicy(), ...(saved ?? {}) };
  if (version < 2 && out.save_jobs === "automatic") out.save_jobs = "off";
  // Version 3: drafts became "ask" by default; a policy still holding the old default moves with it.
  if (version < 3) for (const c of ["generate_resume", "generate_cover_letter"] as const) if (out[c] === "automatic") out[c] = "ask";
  return out;
}

export const AUTOMATION_LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

/** The two choices the candidate is offered (owner decision, 2026-10-09). "Help me" folds into "Work with me", "Keep watch" into "Work independently" — scheduled searches are their own section. */
export const OFFERED_LEVELS = ["guided", "autonomous"] as const satisfies readonly AutomationLevel[];
export const offeredLevel = (l: AutomationLevel): (typeof OFFERED_LEVELS)[number] => (l === "assist" || l === "guided" ? "guided" : "autonomous");

// User-facing question: "How much should Wonder handle?" (outcome spec §21). `short` is the one-line
// answer shown on the choice cards; `description` is the precise version shown for the selected
// level. The level ids (assist/guided/autonomous/continuous) are internal and unchanged, so
// capability gating (resolveCapability below) and persisted state don't move.
export const AUTOMATION_LEVEL_META: Record<AutomationLevel, { label: string; short: string; description: string; recommended?: boolean }> = {
  assist: { label: "Help me", short: "Finds opportunities and asks before important actions.", description: "Wonder finds opportunities and asks before doing anything else — even drafting a resume. Nothing runs on its own." },
  guided: { label: "Work with me", short: "Searches and prepares things, then asks when your decision matters.", description: "Wonder does low-risk work on its own (searching, comparing, drafting) and asks before anything that matters — a recruiter message, a hand-off to an employer, marking an email sent.", recommended: true },
  autonomous: { label: "Work independently", short: "Works within your rules.", description: "Same as Work with me, plus: anything you've set to \"Automatic\" in Automation runs without asking each time — including preparing and handing off applications. Wonder never messages a recruiter or sends an email itself, and submits to an employer only where you turned on Submit applications." },
  continuous: { label: "Keep watch", short: "Keeps looking and tells you only when something is worth your attention.", description: "Same as Work independently, and Wonder also searches on your schedule (Wonder → Scheduled searches), telling you only when something is worth your attention." },
};

/**
 * Decide whether a capability may run without asking, given the policy and the
 * automation level. High-risk/external capabilities never run without explicit
 * permission unless the user set the policy to "automatic" AND the level is
 * autonomous/continuous. `explicit` is the candidate's own choice for one item and wins
 * either way; a missing policy entry is not "automatic", so it fails closed.
 */
export function resolveCapability(capability: Capability, policy: AutomationPolicy, level: AutomationLevel, explicit?: "allow" | "deny"): "run" | "ask" | "skip" {
  // The candidate's own choice for this one item (e.g. "Submit for me" on one application) decides it outright.
  if (explicit === "deny") return "skip";
  if (explicit === "allow") return "run";
  const meta = CAPABILITY_META[capability];
  const mode = policy[capability];
  if (mode === "off") return "skip";
  // Low risk runs on its own only when the candidate left it on Automatic: "Ask me" means ask, never quietly run.
  if (meta.risk === "low") return mode === "automatic" ? "run" : "ask";
  if (meta.risk === "medium") {
    if (level === "assist") return "ask";
    return mode === "automatic" ? "run" : "ask";
  }
  // high risk
  if (mode !== "automatic") return "ask";
  return level === "autonomous" || level === "continuous" ? "run" : "ask";
}
