"use client";
import { useState } from "react";
import { Hand, ShieldCheck, Sparkles } from "lucide-react";
import { MEMORY_LABEL, PROVENANCE_LABEL } from "@/domain/jobs-apply/profile";
import Link from "next/link";
import type { ApplicationField, InterventionItem, MemoryKey } from "@/domain/jobs-apply/types";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Input, Select, Textarea } from "@/components/common/Input";

export type ResolveBody = { action: "approve" | "edit"; value: string; origin?: "ai" | "ai_edited" } | { action: "choose" | "skip" | "answered_on_portal" };

const CATEGORY: Partial<Record<InterventionItem["category"], string>> = {
  WORK_AUTHORIZATION: "work authorization",
  SPONSORSHIP: "sponsorship",
  EEO: "equal-opportunity",
  LEGAL: "legal",
  COMPENSATION: "compensation",
};

/**
 * §51–§52 "Needs you": one card per question, open items first.
 * `headless` (Apply for this job, WJ-311): nobody sees the employer's form, so every answer is given here —
 * with the form's own choices when it has them — and "answer on the form" points to finishing that one step.
 */
export function InterventionQueue({ session, onResolve, onDraft, onRemember, busyId, headless = false, finishHref }: { session: PublicSession; onResolve: (item: InterventionItem, body: ResolveBody) => Promise<void>; onDraft: (question: string, metric?: string) => Promise<string>; onRemember: (key: MemoryKey, value: string) => void; busyId?: string | null; headless?: boolean; finishHref?: string }) {
  const open = session.interventions.filter((i) => i.status === "open");
  const done = session.interventions.filter((i) => i.status !== "open");
  if (!session.interventions.length) return null;
  return (
    <Card aria-labelledby="wj-needs-you">
      <h2 id="wj-needs-you" className="flex items-center gap-2 text-[18px] font-semibold text-ink">
        <Hand className="size-5 text-warning-600" aria-hidden /> Needs you{open.length ? ` — ${open.length} item${open.length === 1 ? "" : "s"}` : ""}
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">{open.length ? (headless ? "Wonder needs these to finish the form. Your answers go only into this application." : "The application is asking for things only you can provide. Answer here, or directly on the employer's form.") : "Everything that needed you is handled."}</p>
      <ol className="mt-4 flex flex-col gap-3">
        {open.map((item, i) => (
          <InterventionCard key={item.id} n={i + 1} item={item} field={session.formFields.find((f) => f.id === item.fieldId)} memoryKey={memoryKeyOf(session, item)} onResolve={onResolve} onDraft={onDraft} onRemember={onRemember} busy={busyId === item.id} headless={headless} finishHref={finishHref} />
        ))}
      </ol>
      {done.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Resolved ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((i) => (
              <li key={i.id} className="text-[12px] text-ink-3">
                {i.label} — {i.status === "skipped" ? "skipped" : (i.resolution ?? "done").replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function memoryKeyOf(session: PublicSession, item: InterventionItem): MemoryKey | undefined {
  const path = session.fieldMappings.find((m) => m.fieldId === item.fieldId)?.sourcePath;
  return path?.startsWith("memory.") ? (path.slice(7) as MemoryKey) : undefined;
}

/** The employer's own choices for a question, when its field has them (a dropdown, radios, a yes/no box). */
function choicesOf(field?: ApplicationField): string[] | null {
  if (!field) return null;
  const opts = (field.options ?? []).map((o) => o.label.trim()).filter((l) => l && !/^(select|choose|please select|--)/i.test(l));
  if ((field.type === "select" || field.type === "radio" || field.type === "combobox") && opts.length) return [...new Set(opts)];
  if (field.type === "checkbox" && !opts.length) return ["Yes", "No"];
  return null;
}

const INPUT_TYPE: Partial<Record<ApplicationField["type"], string>> = { date: "date", number: "number", email: "email", url: "url", phone: "tel" };

function InterventionCard({ n, item, field, memoryKey, onResolve, onDraft, onRemember, busy, headless, finishHref }: { n: number; item: InterventionItem; field?: ApplicationField; memoryKey?: MemoryKey; onResolve: (item: InterventionItem, body: ResolveBody) => Promise<void>; onDraft: (question: string, metric?: string) => Promise<string>; onRemember: (key: MemoryKey, value: string) => void; busy: boolean; headless: boolean; finishHref?: string }) {
  const [value, setValue] = useState(item.suggestion?.value ?? "");
  const [aiText, setAiText] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [metric, setMetric] = useState("");
  const [remember, setRemember] = useState(!!memoryKey && memoryKey !== "workAuthorization" && memoryKey !== "sponsorship");
  const [draftError, setDraftError] = useState<string | null>(null);
  const id = `iv-${item.id}`;
  const optional = !item.required;
  const choices = choicesOf(field);

  const draft = async (withMetric?: string) => {
    setDrafting(true);
    setDraftError(null);
    try {
      const text = await onDraft(item.label, withMetric);
      setAiText(text);
      setValue(text);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Wonder couldn't draft this right now.");
    } finally {
      setDrafting(false);
    }
  };
  const submitValue = async () => {
    const v = value.trim();
    if (!v) return;
    const origin = aiText !== null ? (v === aiText.trim() ? "ai" : "ai_edited") : undefined;
    const unchanged = item.suggestion && v === item.suggestion.value.trim();
    await onResolve(item, { action: unchanged || origin === "ai" ? "approve" : "edit", value: v, origin });
    if (remember && memoryKey) onRemember(memoryKey, v);
  };

  return (
    <li className="rounded-[14px] border border-line p-4" aria-labelledby={`${id}-label`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p id={`${id}-label`} className="min-w-0 text-[14px] font-medium text-ink">
          {n}. {item.label}
        </p>
        <Badge tone={item.required ? "warning" : "neutral"}>{item.required ? "Required" : "Optional"}</Badge>
      </div>

      {item.kind === "answer_on_portal" && headless && (
        <>
          <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Wonder answers {CATEGORY[item.category] ?? "sensitive"} questions only if you turn that on with your own answers, in{" "}
            <Link href="/app/automation/settings" className="font-medium text-brand-600 hover:underline">
              Automation → Sensitive questions
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {finishHref && (
              <Button size="sm" variant="outline" href={finishHref}>
                Answer it on the employer&apos;s page
              </Button>
            )}
            {optional && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "skip" })} disabled={busy}>
                Skip
              </Button>
            )}
          </div>
        </>
      )}

      {item.kind === "answer_on_portal" && !headless && (
        <>
          <p className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Answer this on the employer&apos;s form. Wonder never answers {CATEGORY[item.category] ?? "sensitive"} questions for you — it doesn&apos;t assume them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onResolve(item, { action: "answered_on_portal" })} disabled={busy}>
              I&apos;ve answered it on the form
            </Button>
            {optional && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "skip" })} disabled={busy}>
                Skip
              </Button>
            )}
          </div>
        </>
      )}

      {item.kind === "choose_file_field" && (
        <>
          <p className="mt-2 text-[13px] text-ink-2">Wonder found more than one document field. Which should receive your résumé?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onResolve(item, { action: "choose" })} disabled={busy}>
              Put my résumé here
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "skip" })} disabled={busy}>
              Leave this field empty
            </Button>
          </div>
        </>
      )}

      {(item.kind === "confirm_value" || item.kind === "unknown_field") && (
        <>
          {item.suggestion?.lastConfirmedAt && <p className="mt-1 text-[12px] text-ink-3">Last confirmed: {new Date(item.suggestion.lastConfirmedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>}
          {item.suggestion && !item.suggestion.lastConfirmedAt && <p className="mt-1 text-[12px] text-ink-3">{PROVENANCE_LABEL[item.suggestion.provenance]}</p>}
          <label htmlFor={`${id}-input`} className="sr-only">
            Your answer to {item.label}
          </label>
          {choices ? (
            <Select id={`${id}-input`} className="mt-2" value={choices.includes(value) ? value : ""} onChange={(e) => setValue(e.target.value)}>
              <option value="" disabled>
                Choose an answer
              </option>
              {choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          ) : (
            <Input id={`${id}-input`} type={(field && INPUT_TYPE[field.type]) || "text"} className="mt-2" value={value} onChange={(e) => setValue(e.target.value)} placeholder={item.kind === "unknown_field" ? "Type your answer" : "Your answer"} />
          )}
          {memoryKey && (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my {MEMORY_LABEL[memoryKey].toLowerCase()} for future applications (Wonder will still ask you to confirm it)
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={submitValue} disabled={busy || !value.trim()}>
              Use this
            </Button>
            {!headless && (
              <Button size="sm" variant="outline" onClick={() => onResolve(item, { action: "answered_on_portal" })} disabled={busy}>
                I&apos;ll answer on the form
              </Button>
            )}
            {optional && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "skip" })} disabled={busy}>
                Skip
              </Button>
            )}
          </div>
        </>
      )}

      {(item.kind === "draft_answer" || item.kind === "provide_metric") && (
        <>
          {item.kind === "provide_metric" && aiText === null && (
            <div className="mt-2 rounded-[12px] bg-warning-100/50 p-3">
              <p className="text-[13px] font-medium text-ink">Wonder needs one detail.</p>
              <p className="text-[12px] text-ink-2">What was the measurable impact? Wonder won&apos;t make up a number.</p>
              <label htmlFor={`${id}-metric`} className="sr-only">
                Measurable impact
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input id={`${id}-metric`} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="e.g. cut onboarding time from 5 days to 2" className="min-w-0 flex-1" />
                <Button size="sm" variant="outline" onClick={() => draft(metric.trim())} disabled={!metric.trim() || drafting} loading={drafting}>
                  Draft with this
                </Button>
              </div>
            </div>
          )}
          {item.suggestion && aiText === null && <p className="mt-2 text-[12px] text-ink-3">You prepared an answer for this · {PROVENANCE_LABEL[item.suggestion.provenance]}</p>}
          {aiText !== null && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-brand-700" data-testid="wj-ai-label">
              <Sparkles className="size-3.5" aria-hidden /> AI-generated draft — based on your Career Profile and this role. Review before using.
            </p>
          )}
          {(value || aiText !== null || item.kind === "draft_answer") && (
            <>
              <label htmlFor={`${id}-answer`} className="sr-only">
                Answer to {item.label}
              </label>
              <Textarea id={`${id}-answer`} className="mt-2 min-h-28" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Write your answer, or let Wonder draft one from your Career Profile." />
            </>
          )}
          {draftError && <p className="mt-1 text-[12px] text-danger-600">{draftError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={submitValue} disabled={busy || !value.trim()}>
              Use answer
            </Button>
            {item.kind === "draft_answer" && (
              <Button size="sm" variant="outline" icon={<Sparkles className="size-3.5" aria-hidden />} onClick={() => draft()} disabled={drafting} loading={drafting}>
                {aiText === null ? "Draft with Wonder" : "Regenerate"}
              </Button>
            )}
            {!headless && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "answered_on_portal" })} disabled={busy}>
                I&apos;ll answer on the form
              </Button>
            )}
            {optional && (
              <Button size="sm" variant="ghost" onClick={() => onResolve(item, { action: "skip" })} disabled={busy}>
                Skip
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}
