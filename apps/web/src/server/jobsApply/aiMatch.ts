import { z } from "zod";
import { freshMemory, MEMORY_LABEL, PROFILE_LABEL } from "@/domain/jobs-apply/profile";
import { MEMORY_KEYS, PROFILE_KEYS, type AiHint, type JobsApplySession, type MemoryKey, type ProfileKey } from "@/domain/jobs-apply/types";
import { assist } from "@/server/ai/assist";

/** Never offered to the model as answers: right to work and sponsorship are always the candidate's to give. */
const NEVER_OFFER = new Set<MemoryKey>(["workAuthorization", "sponsorship", "custom"]);

const Reply = z.object({ matches: z.array(z.object({ field: z.string().max(200), source: z.string().max(40) })).max(60) });

/**
 * Questions the rules couldn't place (still "needs you", not human-only, not yet asked about), read by a
 * model and matched to which of the candidate's saved facts answers each — by meaning, not wording
 * ("Total years in identity security" ↔ a learned "How many years have you worked in IAM?").
 *
 * The model sees the questions and the *names* of what the candidate has saved — never their values —
 * and can only choose from that list. Its reply is checked against it; anything else becomes "none".
 * Returns null when no model is configured or the call fails: the rules' result stands.
 */
export async function aiMatchFields(s: Pick<JobsApplySession, "formFields" | "fieldMappings" | "pack" | "aiHints">, now = Date.now()): Promise<Record<string, AiHint> | null> {
  const asked = s.aiHints ?? {};
  const fields = new Map(s.formFields.map((f) => [f.id, f]));
  const open = s.fieldMappings.filter((m) => m.status === "needs_you" && m.classification !== "human-only" && !(m.fieldId in asked) && fields.has(m.fieldId)).slice(0, 25);
  if (!open.length) return null;

  const sources = new Map<string, AiHint>();
  const offered: { id: string; means: string }[] = [];
  for (const key of PROFILE_KEYS as readonly ProfileKey[]) {
    if (!s.pack.profile[key]) continue;
    sources.set(`profile.${key}`, { kind: "profile", key });
    offered.push({ id: `profile.${key}`, means: PROFILE_LABEL[key] });
  }
  for (const key of MEMORY_KEYS as readonly MemoryKey[]) {
    if (NEVER_OFFER.has(key) || !freshMemory(s.pack.memory, key, now)) continue;
    sources.set(`memory.${key}`, { kind: "memory", key });
    offered.push({ id: `memory.${key}`, means: MEMORY_LABEL[key] });
  }
  s.pack.memory
    .filter((m) => m.key === "custom" && m.question && freshMemory([m], "custom", now))
    .slice(-40)
    .forEach((m, i) => {
      sources.set(`learned.${i}`, { kind: "learned", question: m.question! });
      offered.push({ id: `learned.${i}`, means: `The candidate's answer to: ${m.question}` });
    });
  if (!offered.length) return null;

  const questions = open.map((m) => {
    const f = fields.get(m.fieldId)!;
    return { field: m.fieldId, question: (m.label || f.label || "").slice(0, 200), type: f.type, ...(f.hints?.section ? { section: f.hints.section.slice(0, 80) } : {}), ...(f.options?.length ? { choices: f.options.slice(0, 15).map((o) => o.label.slice(0, 60)) } : {}) };
  });
  const reply = await assist({
    task: "form_questions",
    instructions:
      'Match each job-application form question to the one saved fact that answers exactly what it asks, or "none". Only match when the question asks for that same fact — "Total experience" is not "Notice period", "Expected salary" is not "Current salary", "Preferred location" is not "Current location". Read a question in its section: "Start date" under Education is the education start date, not availability; "Name" under Education is the university. "Type of degree" is the degree level, "Degree name" is the degree. When unsure, answer "none". Shape: {"matches":[{"field":"<question field>","source":"<a source id from the list, or none>"}]}.',
    data: JSON.stringify({ questions, sources: offered }),
    schema: Reply,
    maxTokens: 800,
  });
  if (!reply) return null;
  const hints: Record<string, AiHint> = {};
  for (const m of open) hints[m.fieldId] = { kind: "none" };
  for (const r of reply.matches) {
    const hint = sources.get(r.source);
    if (hint && r.field in hints) hints[r.field] = hint;
  }
  return hints;
}
