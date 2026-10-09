"use client";
import { CheckCircle2, HelpCircle, Info } from "lucide-react";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

/**
 * §53–§55 Whether it was submitted. The only in-app answer is the candidate's own "Did you submit the
 * application?"; a confirmation page the helper saw is shown as evidence, never taken as the answer.
 * (Reopening the employer's page lives on the progress card above.)
 */
export function ApplicationReview({ session, onConfirm, busy }: { session: PublicSession; onConfirm: (a: "yes" | "not_yet" | "unsure") => void; busy?: boolean }) {
  const seen = session.evidence.filter((e) => e.kind === "confirmation_page" || e.kind === "confirmation_number");
  const pressed = session.audit.some((a) => a.event === "SUBMISSION_STARTED");
  const ready = session.status === "READY_TO_REVIEW" || session.status === "SUBMITTING" || session.status === "VERIFICATION" || session.status === "UNKNOWN";
  return (
    <Card aria-labelledby="wj-review" className={ready ? "border-brand-200" : undefined}>
      {seen.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-[12px] bg-success-100/60 p-3 text-[13px] text-ink-2" data-testid="wj-evidence">
          <Info className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden />
          <p className="min-w-0">
            Wonder saw a confirmation page on {seen[seen.length - 1].url?.split("/")[0]}
            {seen[seen.length - 1].kind === "confirmation_number" ? (
              <> — confirmation number {seen[seen.length - 1].detail}.</>
            ) : seen[seen.length - 1].detail ? (
              <>
                : <q className="italic">{seen[seen.length - 1].detail}</q>
              </>
            ) : (
              "."
            )}{" "}
            Please confirm below.
          </p>
        </div>
      )}
      <div>
        <h2 id="wj-review" className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <HelpCircle className="size-4 text-brand-600" aria-hidden /> Did you submit the application?
        </h2>
        <p className="mt-1 text-[12px] text-ink-3">{pressed ? "You pressed the employer's submit button. " : ""}Only your answer marks it submitted.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onConfirm("yes")} disabled={busy} icon={<CheckCircle2 className="size-4" aria-hidden />}>
            Yes, application submitted
          </Button>
          <Button size="sm" variant="outline" onClick={() => onConfirm("not_yet")} disabled={busy}>
            Not yet
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onConfirm("unsure")} disabled={busy}>
            I&apos;m not sure
          </Button>
        </div>
        {session.status === "UNKNOWN" && <p className="mt-2 text-[12px] text-warning-600">We aren&apos;t sure whether the application was submitted. Check the employer&apos;s page or your email for a confirmation — Wonder never submits again on its own.</p>}
      </div>
    </Card>
  );
}
