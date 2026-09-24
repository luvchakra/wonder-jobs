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
  "save_jobs",
  "send_recruiter_message",
  "submit_application",
  "send_email",
  "change_career_dna",
  "change_search_preferences",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
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
  generate_resume: { key: "generate_resume", label: "Generate resume", description: "Tailor a resume version for a specific role.", risk: "medium", external: false, default: "automatic" },
  generate_cover_letter: { key: "generate_cover_letter", label: "Generate cover letter", description: "Draft a cover letter you can edit before use.", risk: "medium", external: false, default: "automatic" },
  save_jobs: { key: "save_jobs", label: "Save jobs", description: "Add strong matches to your saved list.", risk: "low", external: false, default: "automatic" },
  // Wonder never contacts a recruiter, submits to an employer, or sends an email on its own — it has
  // no recruiter/employer address to reach and no code path that does. Each of these describes the
  // real hand-off: Wonder prepares everything and opens/queues it for the candidate's own action.
  send_recruiter_message: { key: "send_recruiter_message", label: "Draft a recruiter message", description: "Draft a message for you to send a recruiter yourself.", risk: "high", external: true, default: "ask" },
  submit_application: { key: "submit_application", label: "Hand off application", description: "Open a prepared application on the employer's own site, ready for you to submit.", risk: "high", external: true, default: "ask" },
  send_email: { key: "send_email", label: "Draft follow-up email", description: "Draft a follow-up or thank-you email for you to send yourself, then mark it sent.", risk: "high", external: true, default: "ask" },
  change_career_dna: { key: "change_career_dna", label: "Change Career Profile", description: "Update your skills, goals or profile based on what Wonder learns.", risk: "high", external: false, default: "ask" },
  change_search_preferences: { key: "change_search_preferences", label: "Change search preferences", description: "Adjust locations, salary range or filters automatically.", risk: "high", external: false, default: "ask" },
};

export type AutomationPolicy = Record<Capability, PolicyMode>;

export function defaultPolicy(): AutomationPolicy {
  return Object.fromEntries(CAPABILITIES.map((c) => [c, CAPABILITY_META[c].default])) as AutomationPolicy;
}

export const AUTOMATION_LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

// User-facing question: "How much should Wonder handle?" (outcome spec §21). `short` is the one-line
// answer shown on the choice cards; `description` is the precise version shown for the selected
// level. The level ids (assist/guided/autonomous/continuous) are internal and unchanged, so
// capability gating (resolveCapability below) and persisted state don't move.
export const AUTOMATION_LEVEL_META: Record<AutomationLevel, { label: string; short: string; description: string; recommended?: boolean }> = {
  assist: { label: "Help me", short: "Finds opportunities and asks before important actions.", description: "Wonder finds opportunities and asks before doing anything else — even drafting a resume. Nothing runs on its own." },
  guided: { label: "Work with me", short: "Searches and prepares things, then asks when your decision matters.", description: "Wonder does low-risk work on its own (searching, comparing, drafting) and asks before anything that matters — a recruiter message, a hand-off to an employer, marking an email sent.", recommended: true },
  autonomous: { label: "Work independently", short: "Works within your rules.", description: "Same as Work with me, plus: anything you've set to \"Automatic\" in What Wonder can do runs without asking each time — including preparing and handing off applications. Wonder still never submits to an employer, messages a recruiter or sends an email itself; the final action is always yours." },
  continuous: { label: "Keep watch", short: "Keeps looking and tells you only when something is worth your attention.", description: "Same as Work independently, and Wonder also searches on your schedule (Wonder → Scheduled searches), telling you only when something is worth your attention." },
};

/**
 * Decide whether a capability may run without asking, given the policy and the
 * automation level. High-risk/external capabilities never run without explicit
 * permission unless the user set the policy to "automatic" AND the level is
 * autonomous/continuous.
 */
export function resolveCapability(capability: Capability, policy: AutomationPolicy, level: AutomationLevel): "run" | "ask" | "skip" {
  const meta = CAPABILITY_META[capability];
  const mode = policy[capability];
  if (mode === "off") return "skip";
  if (meta.risk === "low") return "run";
  if (meta.risk === "medium") {
    if (level === "assist") return "ask";
    return mode === "automatic" ? "run" : "ask";
  }
  // high risk
  if (mode !== "automatic") return "ask";
  return level === "autonomous" || level === "continuous" ? "run" : "ask";
}
