/**
 * Field mapping engine (spec §19–§30, §39, §50–§51). Turns the form the helper read into:
 *  - mappings: for each field, what would answer it and whether the helper may fill it;
 *  - interventions: the "Needs you" queue.
 *
 * The rule that everything else follows: a mapping carries a `value` only when the helper may put it
 * in the page — a SAFE field matched with HIGH confidence to the candidate's own data, or a value
 * the candidate approved. Human-only fields never carry a value, even an approved one.
 */
import { classifyField, fieldText, type FieldClass } from "./classify";
import { freshMemory, MEMORY_LABEL, PROFILE_LABEL } from "./profile";
import type { ApplicationField, ApplicationForm, ApplicationPackSnapshot, FieldMapping, InterventionItem, JobsApplySession, MappingSource } from "./types";

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

/** For a select/radio: the option that is exactly the value (case-insensitive), by label or value. */
function pickOption(field: ApplicationField, value: string): string | undefined {
  if (!field.options?.length) return value;
  const v = value.trim().toLowerCase();
  const hit = field.options.find((o) => o.label.trim().toLowerCase() === v || o.value.trim().toLowerCase() === v);
  return hit?.value;
}

function interventionFor(field: ApplicationField, c: FieldClass, kind: InterventionItem["kind"], suggestion?: InterventionItem["suggestion"]): InterventionItem {
  return { id: `iv_${field.id}`, fieldId: field.id, label: field.label || fieldText(field).visible || "Unlabelled field", category: c.category, required: field.required, kind, suggestion, status: "open" };
}

export function mapForm(form: Pick<ApplicationForm, "fields">, pack: ApplicationPackSnapshot, approved: Approved = {}, now = Date.now()): MapResult {
  const mappings: FieldMapping[] = [];
  const interventions: InterventionItem[] = [];
  const hasCover = !!pack.coverLetter;
  const classes = form.fields.map((f) => classifyField(f, { hasCoverLetter: hasCover }));
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

    switch (c.target.kind) {
      case "profile": {
        const pv = pack.profile[c.target.key];
        const label = PROFILE_LABEL[c.target.key];
        if (!pv) {
          const reason = `${label} isn't in your Career Profile.`;
          return field.required ? push({ status: "needs_you", reason }, interventionFor(field, c, "unknown_field")) : push({ status: "skipped", reason: `${reason} Optional — left empty.` });
        }
        const value = pickOption(field, pv.value);
        if (value === undefined) return push({ status: "needs_you", reason: `None of the choices matches “${pv.value}”.` }, interventionFor(field, c, "confirm_value", { value: pv.value, provenance: pv.provenance }));
        const source: MappingSource = pv.provenance === "RESUME_IMPORTED" ? "resume" : "career-profile";
        // Only HIGH-confidence safe fields fill without review (§20); anything less is offered to confirm.
        if (c.confidence === "HIGH" && pv.confidence >= 0.85) return push({ status: "pending", value, source, sourcePath: `profile.${c.target.key}` });
        return push({ status: "needs_you", source, sourcePath: `profile.${c.target.key}`, reason: c.reason ?? `Confirm your ${label.toLowerCase()} fits this field.` }, interventionFor(field, c, "confirm_value", { value: pv.value, provenance: pv.provenance }));
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
