/**
 * Field mapping engine (spec §19–§30, §39, §50–§51). Turns the form the helper read into:
 *  - mappings: for each field, what would answer it and whether the helper may fill it;
 *  - interventions: the "Needs you" queue.
 *
 * The rule that everything else follows: a mapping carries a `value` only when the helper may put it
 * in the page — a SAFE field matched with HIGH confidence to the candidate's own data, or a value
 * the candidate approved. Human-only fields never carry a value, even an approved one.
 */
import { classifyField, fieldText, type FieldClass, type FormContext } from "./classify";
import { shapeProfileValue } from "./fieldValue";
import { freshMemory, MEMORY_LABEL, PROFILE_LABEL } from "./profile";
import type { AiHint, ApplicationField, ApplicationForm, ApplicationPackSnapshot, ApplicationValue, FieldMapping, InterventionItem, JobsApplySession, MappingSource, MemoryKey, ProfileKey, RememberedAnswer } from "./types";

export interface MapResult {
  mappings: FieldMapping[];
  interventions: InterventionItem[];
}

type Approved = JobsApplySession["approvedAnswers"];

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));

/** A prepared answer whose question is clearly this question (≥ 60% of the shorter question's words). */
export function matchPackAnswer(label: string, answers: ApplicationPackSnapshot["answers"]) {
  const a = tokens(label);
  if (a.size === 0) return undefined;
  let best: { score: number; answer: ApplicationPackSnapshot["answers"][number] } | undefined;
  for (const ans of answers) {
    const b = tokens(ans.question);
    if (b.size === 0) continue;
    let common = 0;
    for (const w of a) if (b.has(w)) common++;
    const score = common / Math.min(a.size, b.size);
    if (score >= 0.6 && (!best || score > best.score)) best = { score, answer: ans };
  }
  return best?.answer;
}

/** Same question, same wording? ≥ 60% of the shorter question's words, and both say more than two words. */
function sameQuestion(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size < 2 || y.size < 2) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

/** An answer the candidate gave to this question on an earlier form, confirmed within the freshness window. */
export function learnedAnswer(memory: RememberedAnswer[], question: string, now = Date.now()): RememberedAnswer | undefined {
  let best: { score: number; m: RememberedAnswer } | undefined;
  for (const m of memory) {
    if (m.key !== "custom" || !m.question || !freshMemory([m], "custom", now)) continue;
    const score = sameQuestion(question, m.question);
    if (score >= 0.6 && (!best || score > best.score || (score === best.score && m.confirmedAt > best.m.confirmedAt))) best = { score, m };
  }
  return best?.m;
}

const BOTH_SALARY = /\b(current|present|last drawn)\b.*\b(expected|desired|expectation)\b|\b(expected|desired)\b.*\b(current|present|last drawn)\b/;

/** For a select/radio: the option that is exactly the value (case-insensitive), by label or value. */
function pickOption(field: ApplicationField, value: string): string | undefined {
  if (!field.options?.length) return value;
  const v = value.trim().toLowerCase();
  const hit = field.options.find((o) => o.label.trim().toLowerCase() === v || o.value.trim().toLowerCase() === v);
  return hit?.value;
}

/** Employment status in the candidate's words, matched to however the form words it. */
const EMPLOYMENT: { saved: RegExp; option: RegExp }[] = [
  { saved: /notice/, option: /notice/ },
  { saved: /not (currently )?(working|employed)|unemployed|between jobs|available immediately/, option: /not (currently )?(working|employed)|unemployed|immediate/ },
  { saved: /\b(employed|working|not resigned)\b/, option: /not resigned|currently (employed|working)|^employed|^working|full[- ]time/ },
];

/**
 * A saved answer shaped for this field: a salary into the unit the form asks for (₹60,00,000 into a
 * "Lacs" box is 60), employment status onto the form's own choice. Undefined when it doesn't fit.
 */
export function memoryValueFor(field: ApplicationField, key: MemoryKey, saved: string): string | undefined {
  const text = fieldText(field).all;
  // A tick box ("show my salary to employers") or a date is never answered with a saved sentence.
  if (field.type === "checkbox" || field.type === "date" || field.type === "file") return undefined;
  if ((key === "salaryExpectation" || key === "currentSalary") && !field.options?.length) {
    const lakhsBox = /\b(lac|lacs|lakh|lakhs|lpa)\b/.test(text);
    const n = parseAmount(saved);
    if (n === undefined) return field.type === "number" ? undefined : saved;
    if (lakhsBox) return String(n.lakhs);
    return field.type === "number" ? String(n.rupees) : saved;
  }
  if (key === "employmentStatus" && field.options?.length) {
    const v = saved.toLowerCase();
    const rule = EMPLOYMENT.find((r) => r.saved.test(v));
    const hit = rule && field.options.find((o) => rule.option.test(o.label.toLowerCase()));
    return hit?.value ?? pickOption(field, saved);
  }
  return pickOption(field, saved);
}

/** "₹60,00,000", "60 LPA", "60 lakhs", "6000000" → rupees and lakhs. */
function parseAmount(s: string): { rupees: number; lakhs: number } | undefined {
  const t = s.toLowerCase().replace(/,/g, "");
  const m = /(\d+(?:\.\d+)?)\s*(lpa|lakhs?|lacs?|l\b|cr|crores?)?/.exec(t);
  if (!m) return undefined;
  const x = Number(m[1]);
  const unit = m[2] ?? "";
  const rupees = /^(lpa|lakh|lac|l)/.test(unit) ? x * 100_000 : /^cr/.test(unit) ? x * 10_000_000 : x;
  const lakhs = Math.round((rupees / 100_000) * 100) / 100;
  return { rupees: Math.round(rupees), lakhs };
}

const EDUCATION_KEYS = new Set<ProfileKey>(["university", "degreeName", "degreeType", "fieldOfStudy", "educationStartDate", "educationEndDate"]);
const ROLE_KEYS = new Set<ProfileKey>(["currentEmployer", "currentTitle", "jobStartDate", "jobEndDate"]);
const keyOf = (c: FieldClass): ProfileKey | undefined => (c.target.kind === "profile" ? c.target.key : undefined);

/**
 * The section each field sits in, read from its neighbours when the page has no heading for it: a
 * "Start date" two fields from "Degree" is the course's start; one beside "Company" and "Job title" is
 * the role's. Neighbours are fields on the same step within three places.
 */
export function neighbourContexts(fields: ApplicationField[], classes: FieldClass[]): (FormContext | undefined)[] {
  const ADDRESS = new Set<ProfileKey | undefined>(["addressLine1", "addressLine2", "city", "state", "postalCode", "country"]);
  return fields.map((f, i) => {
    const at = (j: number) => (j >= 0 && j < fields.length && fields[j].step === f.step ? classes[j] : undefined);
    // The nearest recognised neighbour decides: education or address.
    for (let d = 1; d <= 3; d++) {
      for (const c of [at(i - d), at(i + d)]) {
        if (!c) continue;
        if (c.category === "EDUCATION") return "education";
        if (ADDRESS.has(keyOf(c))) return "address";
      }
    }
    // A role needs both its company and its title nearby — "Current company" alone sits beside anything.
    const keys = new Set([-3, -2, -1, 1, 2, 3].map((d) => at(i + d)).map((c) => (c ? keyOf(c) : undefined)));
    if (keys.has("currentEmployer") && keys.has("currentTitle")) return "experience";
    return undefined;
  });
}

/** "Education 2", "Work Experience 3" → the block's place (1, 2), when the page numbers its blocks. */
const blockOf = (section: string | undefined): number | undefined => {
  const m = /(\d{1,2})\s*$/.exec((section ?? "").trim());
  return m && Number(m[1]) >= 1 ? Number(m[1]) - 1 : undefined;
};

/** The candidate's value for the n-th time a form asks this (a 2nd education block reads the 2nd entry). */
function valueAt(key: ProfileKey, n: number, c: FieldClass, pack: ApplicationPackSnapshot): ApplicationValue | undefined {
  const of = (value: string | undefined, provenance: ApplicationValue["provenance"], confidence = 1) => (value?.trim() ? { value: value.trim(), provenance, confidence } : undefined);
  if (EDUCATION_KEYS.has(key) && n > 0) {
    const e = pack.education?.[n];
    if (!e) return undefined;
    const pick: Record<string, string | undefined> = { university: e.institution, degreeName: e.degree, degreeType: e.degreeType, fieldOfStudy: e.field, educationStartDate: e.startDate, educationEndDate: e.endDate };
    return key === "degreeType" ? of(e.degreeType, "AI_DERIVED", 0.9) : of(pick[key], e.provenance);
  }
  if (ROLE_KEYS.has(key) && c.context === "experience" && pack.experience?.length) {
    const r = pack.experience[n];
    if (!r) return undefined;
    const pick: Record<string, string | undefined> = { currentEmployer: r.employer, currentTitle: r.title, jobStartDate: r.startDate, jobEndDate: r.current ? undefined : r.endDate };
    return of(pick[key], r.provenance);
  }
  return pack.profile[key];
}

const fullAddress = (p: ApplicationPackSnapshot["profile"]) =>
  p.addressLine1 ? [p.addressLine1, p.addressLine2, p.city, p.state, p.postalCode, p.country].map((x) => x?.value).filter(Boolean).join(", ") : undefined;

function interventionFor(field: ApplicationField, c: FieldClass, kind: InterventionItem["kind"], suggestion?: InterventionItem["suggestion"]): InterventionItem {
  return { id: `iv_${field.id}`, fieldId: field.id, label: field.label || fieldText(field).visible || "Unlabelled field", category: c.category, required: field.required, kind, suggestion, status: "open" };
}

/**
 * A model's reading of an unrecognised question, turned into the candidate's own value — or undefined.
 * The model only names a source; the value always comes from the profile or saved answers.
 */
export function hintValue(field: ApplicationField, hint: AiHint | undefined, pack: ApplicationPackSnapshot, now: number): string | undefined {
  if (!hint || hint.kind === "none" || field.type === "checkbox" || field.type === "file") return undefined;
  if (hint.kind === "profile") {
    const pv = pack.profile[hint.key];
    const shaped = pv ? shapeProfileValue(field, hint.key, pv.value, { fullAddress: fullAddress(pack.profile) }) : undefined;
    return shaped?.exact ? shaped.value : undefined;
  }
  if (hint.kind === "memory") {
    if (hint.key === "workAuthorization" || hint.key === "sponsorship" || hint.key === "custom") return undefined;
    const m = freshMemory(pack.memory, hint.key, now);
    return m ? memoryValueFor(field, hint.key, m.value) : undefined;
  }
  const m = pack.memory.find((x) => x.key === "custom" && x.question === hint.question && freshMemory([x], "custom", now));
  return m ? pickOption(field, m.value) : undefined;
}

export function mapForm(form: Pick<ApplicationForm, "fields">, pack: ApplicationPackSnapshot, approved: Approved = {}, now = Date.now(), hints: Record<string, AiHint> = {}): MapResult {
  const mappings: FieldMapping[] = [];
  const interventions: InterventionItem[] = [];
  const hasCover = !!pack.coverLetter;
  const first = form.fields.map((f) => classifyField(f, { hasCoverLetter: hasCover }));
  const contexts = neighbourContexts(form.fields, first);
  const classes = form.fields.map((f, i) => (contexts[i] ? classifyField(f, { hasCoverLetter: hasCover, context: contexts[i] }) : first[i]));
  // How many times each key was asked before this field: the n-th education block reads the n-th entry.
  const seen = new Map<string, number>();
  const occurrence = classes.map((c, i) => {
    const key = keyOf(c);
    if (!key || !(EDUCATION_KEYS.has(key) || (ROLE_KEYS.has(key) && c.context === "experience"))) return 0;
    const block = blockOf(form.fields[i].hints?.section);
    if (block !== undefined) return block;
    const id = `${key}:${c.context ?? ""}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n;
  });
  // §30: several fields that could take the résumé → ask which, unless the candidate already chose.
  const resumeFields = form.fields.filter((_, i) => classes[i].target.kind === "file" && (classes[i].target as { file: string }).file === "resume");
  const chosenResumeField = resumeFields.find((f) => approved[f.id]?.value === "resume")?.id;
  const ambiguousResume = resumeFields.length > 1 && !chosenResumeField;

  form.fields.forEach((field, i) => {
    const c = classes[i];
    const base: FieldMapping = { fieldId: field.id, label: field.label || fieldText(field).visible || "Unlabelled field", category: c.category, classification: c.classification, confidence: c.confidence, status: "pending", required: field.required, reason: c.reason, step: field.step };
    const push = (m: Partial<FieldMapping>, iv?: InterventionItem) => {
      mappings.push({ ...base, ...m });
      if (iv) interventions.push(iv);
    };

    // Human-only: never a value, whatever was approved. Credentials don't enter the queue — the page-level
    // sign-in / verification prompt covers them.
    if (c.classification === "human-only") {
      if (c.category === "CREDENTIAL") return push({ status: "skipped" });
      return push({ status: "needs_you" }, interventionFor(field, c, "answer_on_portal"));
    }

    // Something the candidate already typed on the page is theirs — never overwritten (§71 recovery too).
    if (field.hasValue && field.type !== "file") return push({ status: "skipped", reason: "Already filled on the page." });

    // A value the candidate approved in WonderJobs (§23, §51).
    const ok = approved[field.id];
    if (ok && c.target.kind !== "file") {
      const value = pickOption(field, ok.value);
      if (value !== undefined) return push({ status: "confirmed", value, source: ok.provenance === "AI_GENERATED" ? "ai-suggested" : "user-entered", sourcePath: `approved.${field.id}` });
    }

    // The rules didn't recognise this question, but a model matched it to the candidate's own data.
    const ruleKnows = (c.target.kind === "profile" && c.confidence === "HIGH") || c.target.kind === "file" || c.target.kind === "cover_text";
    if (!ruleKnows) {
      const aiValue = hintValue(field, hints[field.id], pack, now);
      if (aiValue !== undefined) {
        const h = hints[field.id];
        return push({ status: "confirmed", value: aiValue, source: "ai-matched", sourcePath: h.kind === "profile" ? `profile.${h.key}` : h.kind === "memory" ? `memory.${h.key}` : "memory.custom" });
      }
    }

    // One box for current and expected salary together: both saved answers, said plainly.
    const words = base.label.toLowerCase();
    if (BOTH_SALARY.test(words) && /salary|ctc|compensation|pay/.test(words) && !field.options?.length && field.type !== "checkbox") {
      const cur = freshMemory(pack.memory, "currentSalary", now);
      const exp = freshMemory(pack.memory, "salaryExpectation", now);
      if (cur && exp) return push({ status: "confirmed", value: `Current: ${cur.value}; Expected: ${exp.value}`, source: "answer-memory", sourcePath: "memory.currentSalary+salaryExpectation" });
    }
    // A question the candidate answered on an earlier form — learned, so it isn't asked twice.
    if (c.target.kind !== "file" && c.target.kind !== "profile" && c.target.kind !== "cover_text") {
      const learned = learnedAnswer(pack.memory, base.label, now);
      const value = learned && field.type !== "checkbox" ? pickOption(field, learned.value) : undefined;
      if (learned && value !== undefined) return push({ status: "confirmed", value, source: "answer-memory", sourcePath: "memory.custom" });
    }

    switch (c.target.kind) {
      case "profile": {
        const key = c.target.key;
        const n = occurrence[i];
        const pv = valueAt(key, n, c, pack);
        const label = PROFILE_LABEL[key];
        const path = n > 0 ? `${EDUCATION_KEYS.has(key) ? "education" : "experience"}[${n}].${key}` : `profile.${key}`;
        if (!pv) {
          const list = EDUCATION_KEYS.has(key) ? pack.education : c.context === "experience" ? pack.experience : undefined;
          const reason = n > 0 && list ? `Your Career Profile has ${list.length} ${EDUCATION_KEYS.has(key) ? "education entr" + (list.length === 1 ? "y" : "ies") : "role" + (list.length === 1 ? "" : "s")}.` : `${label} isn't in your Career Profile.`;
          return field.required ? push({ status: "needs_you", reason }, interventionFor(field, c, "unknown_field")) : push({ status: "skipped", reason: `${reason} Optional — left empty.` });
        }
        const shaped = shapeProfileValue(field, key, pv.value, { fullAddress: fullAddress(pack.profile) });
        const value = shaped.value;
        if (value === undefined) return push({ status: "needs_you", reason: field.options?.length ? `None of the choices matches “${pv.value}”.` : `“${pv.value}” doesn't fit this field's format.` }, interventionFor(field, c, "confirm_value", { value: pv.value, provenance: pv.provenance }));
        const source: MappingSource = pv.provenance === "RESUME_IMPORTED" ? "resume" : "career-profile";
        // Only HIGH-confidence safe fields fill without review (§20); anything less — or a value that had to be
        // reshaped with an assumption, like the 1st of the month — is offered to confirm.
        if (c.confidence === "HIGH" && pv.confidence >= 0.85 && shaped.exact) return push({ status: "pending", value, source, sourcePath: path });
        return push({ status: "needs_you", source, sourcePath: path, reason: c.reason ?? (shaped.exact ? `Confirm your ${label.toLowerCase()} fits this field.` : `Wonder set the day to the 1st — confirm the date.`) }, interventionFor(field, c, "confirm_value", { value, provenance: pv.provenance }));
      }
      case "file": {
        const file = c.target.file;
        const has = file === "resume" ? !!pack.resume : !!pack.coverLetter;
        if (!has) return push({ status: "needs_you", reason: `Your Application Pack has no ${file === "resume" ? "résumé" : "cover letter"}.` }, interventionFor(field, c, "unknown_field"));
        if (file === "resume" && ambiguousResume) return push({ status: "needs_you", reason: "Several fields could take your résumé — choose one." }, interventionFor(field, c, "choose_file_field"));
        if (file === "resume" && chosenResumeField && chosenResumeField !== field.id) return push({ status: "skipped", reason: "You chose another field for your résumé." });
        if (c.confidence !== "HIGH" && !(chosenResumeField === field.id)) return push({ status: "needs_you", reason: "Wonder isn't sure this field wants your résumé." }, interventionFor(field, c, "choose_file_field"));
        return push({ status: "pending", file, source: "application-pack", sourcePath: `pack.${file}` });
      }
      case "cover_text":
        return push({ status: "pending", value: pack.coverLetter?.text ?? "", source: "application-pack", sourcePath: "pack.coverLetter" });
      case "memory": {
        const m = freshMemory(pack.memory, c.target.key, now);
        // Saved in the Career Profile and confirmed within the freshness window: the candidate's own answer, filled.
        const fits = m && c.target.key !== "workAuthorization" && c.target.key !== "sponsorship" ? memoryValueFor(field, c.target.key, m.value) : undefined;
        if (m && fits !== undefined) return push({ status: "confirmed", value: fits, source: "answer-memory", sourcePath: `memory.${c.target.key}` });
        return push({ status: "needs_you", sourcePath: `memory.${c.target.key}`, reason: m ? `You answered this before — confirm it still holds.` : `${MEMORY_LABEL[c.target.key]}: Wonder needs your answer.` }, interventionFor(field, c, "confirm_value", m ? { value: m.value, provenance: "USER_PROVIDED", lastConfirmedAt: m.confirmedAt } : undefined));
      }
      case "draft":
      case "pack_answer": {
        const ans = matchPackAnswer(base.label, pack.answers);
        return push({ status: "needs_you", reason: ans ? "You prepared an answer for this — review it." : c.reason }, interventionFor(field, c, "draft_answer", ans ? { value: ans.answer, provenance: ans.provenance } : undefined));
      }
      case "metric":
        return push({ status: "needs_you" }, interventionFor(field, c, "provide_metric"));
      default:
        return field.required || c.classification === "confirm" ? push({ status: "needs_you" }, interventionFor(field, c, c.classification === "confirm" ? "confirm_value" : "unknown_field")) : push({ status: "skipped", reason: c.reason ? `${c.reason} Optional — left for you.` : "Optional — left for you." });
    }
  });
  return { mappings, interventions };
}

export interface ApplyProgress {
  total: number;
  filled: number;
  fillable: number;
  needsYou: number;
  requiredOpen: number;
  /** 0..100: share of fields handled (filled, confirmed or resolved). */
  percent: number;
}

export function progressOf(s: Pick<JobsApplySession, "fieldMappings" | "interventions">): ApplyProgress {
  const total = s.fieldMappings.filter((m) => m.category !== "CREDENTIAL").length;
  const filled = s.fieldMappings.filter((m) => m.status === "filled").length;
  const fillable = s.fieldMappings.filter((m) => (m.status === "pending" || m.status === "confirmed") && (m.value !== undefined || m.file)).length;
  const open = s.interventions.filter((i) => i.status === "open");
  const resolved = s.interventions.filter((i) => i.status !== "open").length;
  const handled = Math.min(total, filled + resolved + s.fieldMappings.filter((m) => m.status === "skipped" && m.category !== "CREDENTIAL").length);
  return { total, filled, fillable, needsYou: open.length, requiredOpen: open.filter((i) => i.required).length, percent: total ? Math.round((handled / total) * 100) : 0 };
}
