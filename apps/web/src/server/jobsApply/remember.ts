/**
 * Answers the candidate typed on an employer's form, saved — only when they press Save — so the next
 * form fills them. Where each answer goes is decided here from the question itself, never from what the
 * page or the helper claims:
 *  - a contact fact (address, postal code, state, links, phone) → the Career Profile's contact details;
 *  - a remembered answer (salary, notice period, availability, relocation…) → saved answers, dated now;
 *  - anything else → a learned answer under the employer's own wording, matched on later forms.
 * Sensitive questions (EEO, legal, IDs, work authorization, sponsorship, credentials, payment) are never
 * saved, nor anything shaped like a card number.
 */
import type { CareerDNA } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { historyOf, isHttpUrl, isPhone, normalizeUrl, type CareerContact } from "@/domain/career/history";
import { classifyField } from "@/domain/jobs-apply/classify";
import type { FieldType, MemoryKey, RememberedAnswer } from "@/domain/jobs-apply/types";
import { readClientState, writeClientState } from "@/server/clientState";
import { PERSIST_VERSION } from "@/server/workflow/snapshot";

export interface RememberItem {
  label: string;
  type: FieldType;
  value: string;
}

export interface RememberResult {
  saved: { label: string; where: "profile" | "answers" }[];
  skipped: { label: string; reason: string }[];
}

const CONTACT_KEYS: Partial<Record<string, keyof CareerContact>> = {
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  state: "state",
  postalCode: "postalCode",
  linkedinUrl: "linkedinUrl",
  portfolioUrl: "portfolioUrl",
  websiteUrl: "websiteUrl",
  githubUrl: "portfolioUrl",
  phone: "phone",
};
const NEVER_SAVE = new Set<MemoryKey>(["workAuthorization", "sponsorship"]);
const sameQuestion = (a: string, b: string) => a.trim().toLowerCase().replace(/[\s*:?]+$/g, "") === b.trim().toLowerCase().replace(/[\s*:?]+$/g, "");

export async function rememberAnswers(tenantId: string, items: RememberItem[], now = new Date()): Promise<RememberResult> {
  const career = (await readClientState<{ dna?: CareerDNA; answerMemory?: RememberedAnswer[] }>(tenantId, "wj.career")) ?? {};
  const dna = career.dna ?? EMPTY_DNA;
  const history = historyOf(dna);
  const contact: CareerContact = { ...history.contact };
  let memory = [...(career.answerMemory ?? [])];
  const at = now.toISOString();
  const out: RememberResult = { saved: [], skipped: [] };
  let contactChanged = false;
  let memoryChanged = false;

  for (const item of items) {
    const label = item.label.trim().slice(0, 300);
    const value = item.value.trim().slice(0, 500);
    if (!label || !value) continue;
    if (/\b\d{13,19}\b/.test(value.replace(/[\s-]/g, "")) && !/phone|mobile|contact/i.test(label)) {
      out.skipped.push({ label, reason: "Looks like a card or ID number — never saved." });
      continue;
    }
    const c = classifyField({ id: "q", label, type: item.type, required: false });
    if (c.classification === "human-only") {
      out.skipped.push({ label, reason: "A sensitive question — answer it yourself each time." });
      continue;
    }
    const contactKey = c.target.kind === "profile" ? CONTACT_KEYS[c.target.key] : undefined;
    if (contactKey) {
      const v = contactKey === "linkedinUrl" || contactKey === "portfolioUrl" || contactKey === "websiteUrl" ? normalizeUrl(value) : value;
      if ((contactKey === "phone" && !isPhone(v)) || ((contactKey === "linkedinUrl" || contactKey === "portfolioUrl" || contactKey === "websiteUrl") && !isHttpUrl(v))) {
        out.skipped.push({ label, reason: "Doesn't look valid — not saved." });
        continue;
      }
      // The phone the candidate keeps in their profile stays theirs; a form's version only fills a gap.
      if (contactKey === "phone" && contact.phone) continue;
      if (contact[contactKey] !== v) {
        contact[contactKey] = v;
        contactChanged = true;
      }
      out.saved.push({ label, where: "profile" });
      continue;
    }
    const memKey = c.target.kind === "memory" && c.target.key !== "custom" && !NEVER_SAVE.has(c.target.key) ? c.target.key : undefined;
    if (memKey) {
      memory = [...memory.filter((m) => m.key !== memKey), { key: memKey, value, confirmedAt: at, source: "USER_PROVIDED" }];
    } else {
      memory = [...memory.filter((m) => !(m.key === "custom" && m.question && sameQuestion(m.question, label))), { key: "custom", question: label, value, confirmedAt: at, source: "USER_PROVIDED" }];
    }
    memoryChanged = true;
    out.saved.push({ label, where: "answers" });
  }

  if (contactChanged || memoryChanged) {
    const patch: { dna?: CareerDNA; answerMemory?: RememberedAnswer[] } = {};
    if (contactChanged) patch.dna = { ...dna, history: { ...history, contact }, updatedAt: at };
    if (memoryChanged) patch.answerMemory = memory.slice(-200);
    await writeClientState(tenantId, "wj.career", PERSIST_VERSION.career, patch, { merge: true });
  }
  return out;
}
