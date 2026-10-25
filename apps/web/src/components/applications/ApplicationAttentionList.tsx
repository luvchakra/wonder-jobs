import { Award, CalendarClock, Mail, MessageSquare, FileCheck2 } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { Application, ApplicationJob } from "@/domain/applications/types";
import { formatDate, formatTime } from "@/lib/format";
import type { ApplicationAttentionItem } from "@/domain/career/attention";
import { AttentionList, type AttentionRow } from "@/components/career/AttentionList";

const REASON_META: Record<ApplicationAttentionItem["reason"], { icon: AttentionRow["icon"]; tone: AttentionRow["tone"] }> = {
  follow_up_overdue: { icon: Mail, tone: "danger" },
  follow_up_due: { icon: Mail, tone: "warning" },
  interview_soon: { icon: CalendarClock, tone: "info" },
  ready_for_review: { icon: FileCheck2, tone: "warning" },
  employer_response: { icon: MessageSquare, tone: "info" },
  offer: { icon: Award, tone: "warning" },
};

export function jobLabel(job: Pick<ApplicationJob, "company" | "title"> | undefined) {
  return job ? `${job.company} · ${job.title}` : "Job details unavailable";
}

/** Real applications needing attention (due follow-ups, upcoming interviews, materials ready for
 * review, recent employer responses) — shared by Home and the Applications page so the two can
 * never disagree about what "needs attention" means for the same real state. */
export function ApplicationAttentionList({ items, jobs, applications, hrefFor }: { items: ApplicationAttentionItem[]; jobs: Record<string, CanonicalJob>; applications?: Record<string, Application>; hrefFor?: (applicationId: string) => string }) {
  return <AttentionList rows={attentionRows(items, jobs, applications, hrefFor)} />;
}

/** The rows: what it is, the job (the application's own copy when the posting is gone) and when, and its one action. */
export function attentionRows(items: ApplicationAttentionItem[], jobs: Record<string, CanonicalJob>, applications?: Record<string, Application>, hrefFor?: (applicationId: string) => string): AttentionRow[] {
  return items.map((item) => {
    const meta = REASON_META[item.reason];
    const job = applications?.[item.applicationId]?.job ?? jobs[item.jobId];
    const when = item.dueAt ? `${formatDate(item.dueAt, { day: "numeric", month: "short" })}, ${formatTime(item.dueAt)}` : "";
    return { key: `${item.applicationId}-${item.reason}`, href: hrefFor ? hrefFor(item.applicationId) : `/app/applications/${item.applicationId}`, label: item.label, detail: [when, jobLabel(job)].filter(Boolean).join(" · "), icon: meta.icon, tone: meta.tone, action: item.action };
  });
}