"use client";
import { CheckCircle2, CircleDashed, FileText, Hand, Loader2, MinusCircle, Sparkles, XCircle } from "lucide-react";
import { PROVIDER_NAME } from "@/domain/jobs-apply/destination";
import type { ApplyProgress } from "@/domain/jobs-apply/mapper";
import { STATUS_LABEL } from "@/domain/jobs-apply/states";
import type { FieldMapping } from "@/domain/jobs-apply/types";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

const SOURCE: Record<string, string> = {
  "career-profile": "From your Career Profile",
  resume: "From your résumé import",
  "application-pack": "From your Application Pack",
  "answer-memory": "Remembered answer",
  "ai-suggested": "AI draft you approved",
  "user-entered": "Approved by you",
};

function state(m: FieldMapping): { label: string; tone: "success" | "brand" | "warning" | "neutral" | "danger"; icon: React.ReactNode } {
  if (m.status === "filled") return { label: "Filled", tone: "success", icon: <CheckCircle2 className="size-4 text-success-600" aria-hidden /> };
  if (m.status === "failed") return { label: "Couldn't fill", tone: "danger", icon: <XCircle className="size-4 text-danger-600" aria-hidden /> };
  if ((m.status === "pending" || m.status === "confirmed") && (m.value !== undefined || m.file)) return { label: m.status === "confirmed" ? "Approved — ready to fill" : "Ready to fill", tone: "brand", icon: <CircleDashed className="size-4 text-brand-600" aria-hidden /> };
  if (m.status === "needs_you") return { label: m.classification === "human-only" ? "Yours to answer" : "Needs you", tone: "warning", icon: <Hand className="size-4 text-warning-600" aria-hidden /> };
  return { label: "Left for you", tone: "neutral", icon: <MinusCircle className="size-4 text-ink-4" aria-hidden /> };
}

/** "What Wonder did / what it couldn't / what needs you" for the live form (§31, §39, §164). */
export function SessionProgress({ session, progress, helperConnected, fillDecision, onPair, onOpen }: { session: PublicSession; progress: ApplyProgress; helperConnected: boolean | null; fillDecision?: string; onPair: () => void; onOpen: () => void }) {
  const form = session.form;
  const shown = session.fieldMappings.filter((m) => m.category !== "CREDENTIAL");
  const steps = [...new Set(shown.map((m) => m.step ?? 1))].sort((a, b) => a - b);
  return (
    <Card aria-labelledby="wj-apply-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wj-apply-progress" className="text-[18px] font-semibold text-ink">
            {form ? `${form.provider ? PROVIDER_NAME[form.provider] : "Application"} form${form.stepCount ? ` · step ${form.step} of ${form.stepCount}` : ""}` : "Waiting for the application form"}
          </h2>
          <p className="text-[13px] text-ink-3">{STATUS_LABEL[session.status]}</p>
        </div>
        <Badge tone={progress.requiredOpen ? "warning" : progress.total && progress.fillable === 0 ? "success" : "brand"}>{progress.percent}% handled</Badge>
      </div>

      {!form && (
        <div className="mt-4 rounded-[14px] bg-surface-2 p-4 text-[13px] text-ink-2">
          {helperConnected === false ? (
            <>
              <p className="font-medium text-ink">The browser helper isn&apos;t connected to this application.</p>
              <p className="mt-1">Open the employer&apos;s page; if you use the WonderJobs helper, reconnect it. Otherwise switch to guided mode — every value is ready to copy.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onPair}>
                  Reconnect helper
                </Button>
                <Button size="sm" variant="outline" onClick={onOpen}>
                  Open application
                </Button>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden /> The employer&apos;s page is open in another tab. When it shows the application form, the helper reads it and this page updates.
            </p>
          )}
        </div>
      )}

      {form && (
        <>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Application progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-ink-2" data-testid="wj-apply-summary">
            Wonder found {form.fieldCount} field{form.fieldCount === 1 ? "" : "s"}. <strong className="font-medium text-success-600">{progress.filled} filled</strong>
            {progress.fillable > 0 && <> · <strong className="font-medium text-brand-700">{progress.fillable} ready to fill</strong></>}
            {progress.needsYou > 0 && <> · <strong className="font-medium text-warning-600">{progress.needsYou} need{progress.needsYou === 1 ? "s" : ""} you</strong></>}
          </p>
          {progress.fillable > 0 && fillDecision !== "skip" && <p className="mt-1 text-[12px] text-ink-3">Choose “Fill {progress.fillable} field{progress.fillable === 1 ? "" : "s"}” in the WonderJobs panel on the employer&apos;s page.</p>}
          {steps.map((step) => (
            <div key={step} className="mt-4">
              {steps.length > 1 && <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Step {step}</p>}
              <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label={steps.length > 1 ? `Fields on step ${step}` : "Fields on the form"}>
                {shown
                  .filter((m) => (m.step ?? 1) === step)
                  .map((m) => {
                    const st = state(m);
                    return (
                      <li key={m.fieldId} className="flex items-start gap-3 p-3">
                        <span className="mt-0.5">{st.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-ink">
                            {m.label}
                            {m.required && <span className="text-ink-4"> *</span>}
                          </p>
                          {m.file ? (
                            <p className="flex items-center gap-1 text-[12px] text-ink-3">
                              <FileText className="size-3.5" aria-hidden /> {m.file === "resume" ? session.pack.resume?.filename : session.pack.coverLetter?.filename}
                            </p>
                          ) : m.value !== undefined && m.classification !== "human-only" ? (
                            <p className="truncate text-[12px] text-ink-2">{m.value}</p>
                          ) : null}
                          <p className="text-[11px] text-ink-4">{m.source ? SOURCE[m.source] : m.reason}</p>
                        </div>
                        <Badge tone={st.tone} className="shrink-0">
                          {st.label}
                        </Badge>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

/** The mockup's right-hand "Wonder filled this" card, reading only what happened. */
export function FilledSummary({ session, progress }: { session: PublicSession; progress: ApplyProgress }) {
  const open = session.interventions.filter((i) => i.status === "open");
  const resumeAttached = session.fieldMappings.some((m) => m.file === "resume" && m.status === "filled");
  return (
    <Card aria-labelledby="wj-filled">
      <h2 id="wj-filled" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Sparkles className="size-4 text-brand-600" aria-hidden /> Wonder filled this
      </h2>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-ink-2">
        <li className="flex items-center gap-2">
          <CheckCircle2 className={`size-4 ${progress.filled ? "text-success-600" : "text-ink-4"}`} aria-hidden /> {progress.filled} field{progress.filled === 1 ? "" : "s"} from your own profile
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className={`size-4 ${resumeAttached ? "text-success-600" : "text-ink-4"}`} aria-hidden /> {resumeAttached ? `Résumé attached (${session.pack.resume?.filename})` : "Résumé not attached yet"}
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success-600" aria-hidden /> Nothing submitted — that&apos;s yours
        </li>
      </ul>
      <p className="mt-4 text-[13px] font-semibold text-ink">Fields requiring your review</p>
      {open.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {open.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-[13px] text-ink-2">
              <Hand className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden /> <span className="min-w-0 truncate">{i.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-ink-3">{session.form ? "None right now." : "Shown once the form is read."}</p>
      )}
    </Card>
  );
}
