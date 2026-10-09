/**
 * The candidate's answers to sensitive questions, kept in a server-only document (`wj.sensitive`) and
 * encrypted at rest with the same AES-256-GCM scheme as BYOK keys. The browser never stores them; it
 * reads the answers back only on the candidate's own Automation page, and ID numbers only ever masked.
 * A number is decrypted solely to put it in a field the candidate allowed (see `withIdNumbers`).
 */
import { migratePolicy, POLICY_VERSION, resolveCapability, type AutomationLevel } from "@/domain/automation/policy";
import type { CareerDNA } from "@/domain/career/types";
import { historyOf } from "@/domain/career/history";
import { ID_KINDS, markedId, SENSITIVE_GROUPS, type IdKind, type PackSensitive, type SensitiveAnswers, type SensitiveGroup } from "@/domain/jobs-apply/sensitive";
import { readClientState, readClientStateVersioned } from "@/server/clientState";
import { decrypt, encrypt } from "@/server/secrets";
import { stateStore } from "@/server/state";

const STORE = "wj.sensitive" as const;

interface Doc {
  answers?: string; // encrypted JSON of SensitiveAnswers
  ids?: Partial<Record<IdKind, { ciphertext: string; masked: string; updatedAt: string }>>;
}

async function read(tenantId: string): Promise<Doc> {
  return ((await stateStore.get(tenantId, STORE))?.state as Doc | undefined) ?? {};
}

const maskId = (v: string) => (v.length > 4 ? `${"•".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}` : "••••");

/** For the candidate's own Automation page: their answers, and which ID numbers are saved — masked. */
export async function getSensitive(tenantId: string): Promise<{ answers: SensitiveAnswers; ids: Partial<Record<IdKind, string>> }> {
  const doc = await read(tenantId);
  const answers = doc.answers ? (JSON.parse(decrypt(doc.answers)) as SensitiveAnswers) : {};
  const ids = Object.fromEntries(Object.entries(doc.ids ?? {}).map(([k, v]) => [k, v!.masked])) as Partial<Record<IdKind, string>>;
  return { answers, ids };
}

/** Save answers (replacing them) and set or clear ID numbers (`null` clears one; absent leaves it). */
export async function putSensitive(tenantId: string, input: { answers?: SensitiveAnswers; ids?: Partial<Record<IdKind, string | null>> }): Promise<void> {
  const doc = await read(tenantId);
  const next: Doc = { ...doc, ids: { ...(doc.ids ?? {}) } };
  if (input.answers) next.answers = encrypt(JSON.stringify(input.answers));
  const at = new Date().toISOString();
  for (const [k, v] of Object.entries(input.ids ?? {}) as [IdKind, string | null][]) {
    if (!ID_KINDS.includes(k)) continue;
    if (v === null || !v.trim()) delete next.ids![k];
    else next.ids![k] = { ciphertext: encrypt(v.trim()), masked: maskId(v.trim()), updatedAt: at };
  }
  await stateStore.put(tenantId, STORE, next);
}

/**
 * What a pack may carry: the groups whose capability isn't off for this candidate, their answers, and which
 * ID numbers exist (never the numbers). Unreadable policy or answers fail closed: nothing is allowed.
 */
export async function packSensitive(tenantId: string): Promise<PackSensitive | undefined> {
  try {
    const [automation, career, doc] = await Promise.all([readClientStateVersioned<{ policy?: Record<string, string>; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation"), readClientState<{ dna?: CareerDNA }>(tenantId, "wj.career"), getSensitive(tenantId)]);
    const policy = migratePolicy(automation?.state.policy as never, automation?.version ?? POLICY_VERSION);
    const level = automation?.state.defaultLevel ?? "guided";
    // Each group is the candidate's explicit opt-in: it fills only when set to Automatic and allowed at this level.
    const allowed = SENSITIVE_GROUPS.filter((g: SensitiveGroup) => policy[g] === "automatic" && resolveCapability(g, policy, level) === "run");
    if (!allowed.length) return undefined;
    const location = historyOf(career?.dna ?? {}).contact.location ?? "";
    const parts = location.split(",").map((x) => x.trim()).filter(Boolean);
    return { allowed, answers: doc.answers, ids: Object.keys(doc.ids) as IdKind[], homeCountry: parts.length >= 2 ? parts[parts.length - 1] : undefined };
  } catch {
    return undefined;
  }
}

/** Swap ID markers for the numbers, only in fills about to go to the candidate's own browser. */
export async function withIdNumbers<T extends { value?: string }>(tenantId: string, fills: T[]): Promise<T[]> {
  if (!fills.some((f) => markedId(f.value))) return fills;
  const doc = await read(tenantId);
  return fills.flatMap((f) => {
    const kind = markedId(f.value);
    if (!kind) return [f];
    const stored = doc.ids?.[kind];
    return stored ? [{ ...f, value: decrypt(stored.ciphertext) }] : [];
  });
}
