import type { MemoryKey } from "@/domain/jobs-apply/types";

/**
 * Screening questions on a job a company posts on WonderJobs (owner, 2026-10-28), the way Greenhouse, Lever, Ashby
 * and LinkedIn do them: a few short questions every applicant answers, some of them "must-haves" (knock-outs). A
 * must-have never rejects anyone on its own: the hiring team sees "Doesn't meet: …" on the application and decides.
 * Shared by the job form, the server (which enforces it) and Easy Apply (which fills answers the candidate saved).
 */
export type ScreeningKind = "yes_no" | "number" | "text";

export interface ScreeningQuestion {
  id: string;
  kind: ScreeningKind;
  prompt: string;
  required: boolean;
  /** A must-have: yes/no needs this answer; a number needs at least `min`. */
  mustHave?: { equals?: "yes" | "no"; min?: number };
  /** Where the candidate's saved answer to this question lives (Career Profile → Application answers), when it maps to one. */
  memoryKey?: MemoryKey;
  /** Answered from the candidate's Career Profile (years of experience). */
  profileKey?: "yearsExperience";
}

export const MAX_QUESTIONS = 5;
export const MAX_PROMPT = 200;
export const MAX_ANSWER = 500;

/** Ready-made questions most employers ask; the form offers them first. Their ids are stable, so saved answers match. */
export const QUESTION_PRESETS: ScreeningQuestion[] = [
  { id: "q_work_auth", kind: "yes_no", prompt: "Are you legally allowed to work in the job's location?", required: true, memoryKey: "workAuthorization" },
  { id: "q_sponsorship", kind: "yes_no", prompt: "Will you now or in future need visa sponsorship?", required: true, memoryKey: "sponsorship" },
  { id: "q_years", kind: "number", prompt: "How many years of relevant experience do you have?", required: true, profileKey: "yearsExperience" },
  { id: "q_notice", kind: "text", prompt: "What is your notice period?", required: true, memoryKey: "noticePeriod" },
  { id: "q_salary", kind: "text", prompt: "What salary do you expect?", required: false, memoryKey: "salaryExpectation" },
  { id: "q_relocate", kind: "yes_no", prompt: "Are you willing to relocate for this job?", required: false, memoryKey: "relocation" },
];

const KINDS: ScreeningKind[] = ["yes_no", "number", "text"];

/** The questions as a form or a request gave them, cleaned; or the first thing wrong with them. */
export function cleanQuestions(raw: unknown): { questions: ScreeningQuestion[] } | { problem: string } {
  if (raw == null) return { questions: [] };
  if (!Array.isArray(raw)) return { problem: "Screening questions must be a list." };
  if (raw.length > MAX_QUESTIONS) return { problem: `Ask at most ${MAX_QUESTIONS} screening questions.` };
  const out: ScreeningQuestion[] = [];
  const seen = new Set<string>();
  for (const r of raw as Record<string, unknown>[]) {
    const prompt = typeof r?.prompt === "string" ? r.prompt.replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT) : "";
    if (prompt.length < 5) return { problem: "Write each screening question in a few words." };
    const kind = KINDS.includes(r.kind as ScreeningKind) ? (r.kind as ScreeningKind) : null;
    if (!kind) return { problem: `“${prompt}” needs a kind of answer: Yes / No, a number or text.` };
    const id = typeof r.id === "string" && /^q_[a-z0-9_]{1,40}$/.test(r.id) ? r.id : `q_${hash(prompt)}`;
    if (seen.has(id)) return { problem: `“${prompt}” is asked twice.` };
    seen.add(id);
    const preset = QUESTION_PRESETS.find((p) => p.id === id);
    const must = r.mustHave as ScreeningQuestion["mustHave"] | undefined;
    let mustHave: ScreeningQuestion["mustHave"];
    if (must && kind === "yes_no" && (must.equals === "yes" || must.equals === "no")) mustHave = { equals: must.equals };
    else if (must && kind === "number" && typeof must.min === "number" && Number.isFinite(must.min) && must.min >= 0) mustHave = { min: Math.round(must.min * 10) / 10 };
    else if (must && (must.equals != null || must.min != null)) return { problem: `“${prompt}”: a must-have is a Yes / No answer or a minimum number.` };
    // A must-have is always required: an empty answer can't meet it.
    out.push({ id, kind, prompt, required: !!r.required || !!mustHave, ...(mustHave ? { mustHave } : {}), ...(preset?.memoryKey ? { memoryKey: preset.memoryKey } : {}), ...(preset?.profileKey ? { profileKey: preset.profileKey } : {}) });
  }
  return { questions: out };
}

/** The applicant's answers, cleaned against the job's questions; or the first required one missing or malformed. */
export function cleanAnswers(questions: ScreeningQuestion[], raw: unknown): { answers: Record<string, string> } | { problem: string; questionId: string } {
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const v = typeof given[q.id] === "string" ? (given[q.id] as string).trim().slice(0, MAX_ANSWER) : typeof given[q.id] === "number" ? String(given[q.id]) : "";
    if (!v) {
      if (q.required) return { problem: `Answer “${q.prompt}”.`, questionId: q.id };
      continue;
    }
    if (q.kind === "yes_no") {
      const yn = normalizeYesNo(v);
      if (!yn) return { problem: `Answer Yes or No to “${q.prompt}”.`, questionId: q.id };
      answers[q.id] = yn;
    } else if (q.kind === "number") {
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 100) return { problem: `Answer “${q.prompt}” with a number.`, questionId: q.id };
      answers[q.id] = String(Math.round(n * 10) / 10);
    } else answers[q.id] = v;
  }
  return { answers };
}

/** "yes" / "no" from what a person (or a saved answer) wrote, or null when it is neither. */
export function normalizeYesNo(v: string): "yes" | "no" | null {
  const t = v.trim().toLowerCase();
  if (/^(y|yes|true|i am|i do|i will|sure|authori[sz]ed)\b/.test(t)) return "yes";
  if (/^(n|no|false|not|i am not|i don'?t|i won'?t|never)\b/.test(t)) return "no";
  return null;
}

/** The must-have questions an application's answers don't meet, by prompt. Unanswered must-haves count as not met. */
export function unmetMustHaves(questions: ScreeningQuestion[], answers: Record<string, string>): string[] {
  return questions
    .filter((q) => {
      if (!q.mustHave) return false;
      const a = answers[q.id];
      if (a == null || a === "") return true;
      if (q.mustHave.equals) return a !== q.mustHave.equals;
      if (q.mustHave.min != null) return !(Number(a) >= q.mustHave.min);
      return false;
    })
    .map((q) => q.prompt);
}

/** The answer a candidate would give from what they already saved: their Application answers, or their profile. */
export function savedAnswer(q: ScreeningQuestion, from: { memory: { key: MemoryKey; question?: string; value: string }[]; yearsExperience?: number }): string | undefined {
  if (q.profileKey === "yearsExperience") return from.yearsExperience && from.yearsExperience > 0 ? String(from.yearsExperience) : undefined;
  const m = q.memoryKey ? from.memory.find((x) => x.key === q.memoryKey) : from.memory.find((x) => x.key === "custom" && x.question && sameQuestion(x.question, q.prompt));
  if (!m?.value) return undefined;
  if (q.kind === "yes_no") return normalizeYesNo(m.value) ?? undefined;
  if (q.kind === "number") return Number.isFinite(Number(m.value)) ? m.value : undefined;
  return m.value;
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2);
/** Two wordings of one question: most of their words in common. */
export function sameQuestion(a: string, b: string): boolean {
  const wa = new Set(words(a));
  const wb = words(b);
  if (!wa.size || !wb.length) return false;
  const common = wb.filter((w) => wa.has(w)).length;
  return common / Math.max(wa.size, wb.length) >= 0.7;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
