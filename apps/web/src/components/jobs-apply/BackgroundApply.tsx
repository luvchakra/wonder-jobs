"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { resolveCapability } from "@/domain/automation/policy";
import { formWait } from "@/domain/jobs-apply/waiting";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useAIService } from "@/lib/useAIService";
import { useBackgroundApply } from "@/lib/useBackgroundApply";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { InterventionQueue } from "@/components/jobs-apply/InterventionQueue";

/**
 * Apply for this job (WJ-311). One button that becomes the whole application: it fills the employer's form
 * in the background (nobody sees that page), turns into "Filling your application…" while it works, asks
 * here for what only the candidate can answer, and comes back as "Submit this application" once the form's
 * last page is complete. Nothing reaches the employer until that press.
 */
export function BackgroundApply({ jobId }: { jobId: string }) {
  const { job, app, resume, view, phase, error, busyId, start, resolve, submit, cancel } = useBackgroundApply(jobId);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const dna = useCareerStore((s) => s.dna);
  const rememberAnswer = useCareerStore((s) => s.rememberAnswer);
  const ai = useAIService();
  const finishHref = `/app/jobs/${jobId}/apply`;
  const s = view?.session;

  // The form never appeared (a sign-in first, or a job description instead of a form): say so after a while.
  const [now, setNow] = useState(() => Date.now());
  const working = phase === "starting" || phase === "filling";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [working]);
  const formMissing = !!s && phase === "filling" && formWait(s, now) === "timed_out";

  if (!job) return null;
  const company = job.company;
  const progress = view?.progress;
  const openRequired = s?.interventions.filter((i) => i.status === "open" && i.required).length ?? 0;

  const label =
    phase === "idle" || phase === "error"
      ? "Apply for this job"
      : phase === "starting"
        ? "Opening the application…"
        : phase === "filling"
          ? "Filling your application…"
          : phase === "needs_you"
            ? `Answer ${openRequired} question${openRequired === 1 ? "" : "s"} to continue`
            : phase === "ready"
              ? "Submit this application"
              : phase === "submitting"
                ? "Submitting…"
                : phase === "submitted"
                  ? "Application submitted"
                  : "Filling paused";
  const enabled = phase === "idle" || phase === "error" || phase === "ready";
  const spinning = phase === "starting" || phase === "filling" || phase === "submitting";

  const blockedReason = !s
    ? null
    : view?.decisions?.fill === "skip"
      ? "Filling forms is turned off in Automation, so Wonder can't fill this one."
      : s.status === "AUTHENTICATION_REQUIRED"
        ? `${company}'s site wants you to sign in before the form.`
        : s.status === "VERIFICATION" || s.form?.signals.includes("captcha")
          ? `${company}'s site is asking for a verification check only you can do.`
          : s.status === "PAUSED" && s.failure === "DOMAIN_CHANGED"
            ? "The application moved to a different site, so Wonder paused."
            : s.status === "FAILED"
              ? "Wonder couldn't find the application form on that page."
              : s.stopped
                ? "You stopped this application."
                : formMissing
                  ? `${company}'s application form hasn't appeared. Nothing has been filled or sent.`
                  : null;

  const draft = async (question: string, metric?: string) => {
    // Drafting is AI generation: gated like the rest of it; the candidate's click is the "ask".
    if (resolveCapability("generate_cover_letter", policy, level) === "skip") throw new Error("Drafting is turned off in Automation (Generate cover letter).");
    return ai().answerApplicationQuestion({ job, dna, question, metric });
  };

  const steps = (s?.audit ?? []).filter((a) => a.event !== "SESSION_CREATED").slice(-10);

  return (
    <div className="flex flex-col gap-3">
      {phase === "submitted" ? (
        <div role="status" className="flex flex-col gap-2 rounded-[14px] bg-success-100/50 p-3 text-[13px] text-ink-2">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <CheckCircle2 className="size-4 text-success-600" aria-hidden /> Submitted to {company}
          </p>
          <p>Wonder pressed {company}&apos;s Submit after you asked it to{s?.evidence.some((e) => e.kind === "confirmation_page" || e.kind === "confirmation_number") ? ", and saw their confirmation." : "."}</p>
          {app && (
            <Link href={`/app/applications/${app.id}`} className="font-medium text-brand-600 hover:underline">
              View application
            </Link>
          )}
        </div>
      ) : (
        <Button size="lg" full disabled={!enabled || (!resume && phase === "idle")} loading={spinning} onClick={() => void (phase === "ready" ? submit() : start())}>
          {label}
        </Button>
      )}

      {phase === "idle" && !resume && (
        <p className="text-[12px] text-ink-3">
          Add a résumé first —{" "}
          <Link href="/app/resume-studio" className="font-medium text-brand-600 hover:underline">
            Résumés
          </Link>
          .
        </p>
      )}
      {phase === "idle" && resume && <p className="text-[12px] text-ink-3">Wonder fills {company}&apos;s form for you with your profile and {resume.label.toLowerCase().startsWith("your") ? resume.label.charAt(0).toLowerCase() + resume.label.slice(1) : resume.label}. Nothing is sent until you press Submit.</p>}
      {phase === "ready" && <p className="text-[12px] text-ink-3">Every required field is filled. Pressing Submit sends it to {company} once.</p>}

      {error && (
        <p role="alert" className="rounded-[12px] bg-danger-100 px-3 py-2 text-[13px] text-danger-600">
          {error.message}{" "}
          {error.applicationId && (
            <Link href={`/app/applications/${error.applicationId}`} className="font-medium underline">
              View application
            </Link>
          )}
        </p>
      )}

      {(phase === "blocked" || formMissing) && blockedReason && (
        <div role="alert" className="flex flex-col gap-2 rounded-[12px] bg-warning-100/50 px-3 py-2 text-[13px] text-ink-2">
          <p>{blockedReason}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" href={finishHref}>
              Finish on {company}&apos;s page
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void cancel()}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {s && phase !== "idle" && phase !== "submitted" && (
        <Fold title="Progress" hint={progress ? `${progress.filled} of ${progress.total} fields filled${s.finalStep ? " · last page" : s.form?.step && s.form.step > 1 ? ` · page ${s.form.step}` : ""}` : "Starting"}>
          <ol className="flex flex-col gap-1.5 text-[12.5px] text-ink-2" aria-live="polite">
            {steps.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex gap-2">
                <span className="shrink-0 text-ink-4">{new Date(a.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                <span>{a.detail}</span>
              </li>
            ))}
            {spinning && (
              <li className="flex items-center gap-2 text-ink-3">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Working…
              </li>
            )}
          </ol>
          <p className="mt-2 text-[12px] text-ink-3">Filled from your Career Profile, saved answers and résumé. Answers you give here go only into this application.</p>
          {phase !== "submitting" && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => void cancel()}>
              Cancel this application
            </Button>
          )}
        </Fold>
      )}

      {s && (phase === "needs_you" || s.interventions.some((i) => i.status === "open")) && phase !== "submitted" && (
        <InterventionQueue session={s} onResolve={resolve} onDraft={draft} onRemember={rememberAnswer} busyId={busyId} headless finishHref={finishHref} />
      )}
    </div>
  );
}
