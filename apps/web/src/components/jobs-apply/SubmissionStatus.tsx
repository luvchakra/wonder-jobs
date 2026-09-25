import { Bell, CalendarClock, CheckCircle2, Search } from "lucide-react";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";

/** §54, §56 After the candidate confirmed. States exactly what Wonder knows and what it will do next. */
export function SubmissionStatus({ session, applicationHref, followUpDue }: { session: PublicSession; applicationHref: string; followUpDue?: string }) {
  const confirmed = [...session.evidence].reverse().find((e) => e.kind === "candidate_confirmed");
  const seen = [...session.evidence].reverse().find((e) => e.kind === "confirmation_number" || e.kind === "confirmation_page");
  const at = confirmed?.at ?? session.completedAt;
  return (
    <Card className="mx-auto max-w-2xl text-center" aria-labelledby="wj-submitted">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-100 text-success-600">
        <CheckCircle2 className="size-8" aria-hidden />
      </span>
      <h2 id="wj-submitted" className="mt-3 text-[22px] font-semibold text-ink">
        Application submitted
      </h2>
      <p className="mt-1 text-[14px] text-ink-2">
        You confirmed your application to {session.company} for {session.jobTitle}
        {at ? ` on ${new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}.
      </p>
      {seen && (
        <p className="mt-2 text-[13px] text-ink-3">
          {seen.kind === "confirmation_number" ? "Confirmation" : "Confirmation page seen"}: {seen.detail ?? seen.url}
        </p>
      )}
      <div className="mt-5 rounded-[14px] bg-success-100/50 p-4 text-left">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <CheckCircle2 className="size-4 text-success-600" aria-hidden /> Tracked in Applications
        </p>
        <ul className="mt-2 flex flex-col gap-2 text-[13px] text-ink-2">
          <li className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> {followUpDue ? `A follow-up reminder is set for ${new Date(followUpDue).toLocaleDateString(undefined, { day: "numeric", month: "short" })} if you haven't heard back.` : "Add a follow-up reminder from the application's timeline."}
          </li>
          <li className="flex items-start gap-2">
            <Bell className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> Record replies and interviews on the application&apos;s timeline — Wonder doesn&apos;t read your email.
          </li>
        </ul>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="outline" href={applicationHref}>
          View in Applications
        </Button>
        <Button href="/app/jobs" icon={<Search className="size-4" aria-hidden />}>
          Find more jobs
        </Button>
      </div>
    </Card>
  );
}
