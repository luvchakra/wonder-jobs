"use client";
import { CheckCircle2, ExternalLink, HelpCircle, Info } from "lucide-react";
import type { ApplyProgress } from "@/domain/jobs-apply/mapper";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

/**
 * §53–§55 Review, then submit — on the employer's site. The only in-app answer is the candidate's
 * own "Did you submit the application?"; a confirmation page the helper saw is shown as evidence,
 * never taken as the answer.
 */
export function ApplicationReview({ session, progress, onOpen, onConfirm, busy }: { session: PublicSession; progress: ApplyProgress; onOpen: () => void; onConfirm: (a: "yes" | "not_yet" | "unsure") => void; busy?: boolean }) {
  const answered = session.interventions.filter((i) => i.status === "resolved").length;
  const skipped = session.interventions.filter((i) => i.status === "skipped").length;
  const cover = session.fieldMappings.some((m) => m.file === "cover_letter" && m.status === "filled") || session.fieldMappings.some((m) => m.sourcePath === "pack.coverLetter" && m.status === "filled");
  const seen = session.evidence.filter((e) => e.kind === "confirmation_page" || e.kind === "confirmation_number");
  const pressed = session.audit.some((a) => a.event === "SUBMISSION_STARTED");
  const ready = session.status === "READY_TO_REVIEW" || session.status === "SUBMITTING" || session.status === "VERIFICATION" || session.status === "UNKNOWN";
  return (
    <Card aria-labelledby="wj-review" className={ready ? "border-brand-200" : undefined}>
      <h2 id="wj-review" className="text-[18px] font-semibold text-ink">
        {ready ? "Ready for your review" : "Review and submit when you're ready"}
      </h2>
      <dl className="mt-3 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-ink-3">Company</dt>
        <dd className="text-ink">{session.company}</dd>
        <dt className="text-ink-3">Role</dt>
        <dd className="text-ink">{session.jobTitle}</dd>
        {session.form && (
          <>
            <dt className="text-ink-3">Filled by Wonder</dt>
            <dd className="text-ink">
              {progress.filled} of {progress.total} fields
            </dd>
          </>
        )}
        <dt className="text-ink-3">Résumé</dt>
        <dd className="break-words text-ink">{session.pack.resume?.filename ?? "—"}</dd>
        <dt className="text-ink-3">Cover letter</dt>
        <dd className="text-ink">{session.pack.coverLetter ? (cover ? "Attached" : "Ready — attach it if the form asks") : "Not included"}</dd>
        {session.interventions.length > 0 && (
          <>
            <dt className="text-ink-3">Questions</dt>
            <dd className="text-ink">
              {answered} answered{skipped ? ` · ${skipped} skipped` : ""}
              {progress.needsYou ? ` · ${progress.needsYou} still need you` : ""}
            </dd>
          </>
        )}
        <dt className="text-ink-3">Destination</dt>
        <dd className="break-all text-ink">{session.destination.domain}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onOpen} iconRight={<ExternalLink className="size-4" aria-hidden />}>
          Submit on the employer site
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-ink-4">Opens {session.company}&apos;s application. Review it there and press their submit button yourself — Wonder never clicks it.</p>

      {seen.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-success-100/60 p-3 text-[13px] text-ink-2" data-testid="wj-evidence">
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
      <div className="mt-5 rounded-[14px] border border-line p-4">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <HelpCircle className="size-4 text-brand-600" aria-hidden /> Did you submit the application?
        </p>
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
