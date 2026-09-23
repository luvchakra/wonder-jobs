import { CalendarClock, Mail, MessageSquare, FileCheck2 } from "lucide-react";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { ApplicationAttentionItem } from "@/domain/career/attention";
import { AttentionList, type AttentionRow } from "@/components/career/AttentionList";

const REASON_META: Record<ApplicationAttentionItem["reason"], { icon: AttentionRow["icon"]; tone: AttentionRow["tone"] }> = {
  follow_up_overdue: { icon: Mail, tone: "danger" },
  follow_up_due: { icon: Mail, tone: "warning" },
  interview_soon: { icon: CalendarClock, tone: "info" },
  ready_for_review: { icon: FileCheck2, tone: "warning" },
  employer_response: { icon: MessageSquare, tone: "info" },
};

export function jobLabel(job: CanonicalJob | undefined) {
  return job ? `${job.title} at ${job.company}` : "a saved role";
}

/** Real applications needing attention (due follow-ups, upcoming interviews, materials ready for
 * review, recent employer responses) — shared by Home and the Applications page so the two can
 * never disagree about what "needs attention" means for the same real state. */
export function ApplicationAttentionList({ items, jobs, hrefFor }: { items: ApplicationAttentionItem[]; jobs: Record<string, CanonicalJob>; hrefFor?: (applicationId: string) => string }) {
  const rows: AttentionRow[] = items.map((item) => {
    const meta = REASON_META[item.reason];
    const job = jobs[item.jobId];
    return { key: `${item.applicationId}-${item.reason}`, href: hrefFor ? hrefFor(item.applicationId) : `/app/applications/${item.applicationId}`, label: `${item.label} — ${jobLabel(job)}`, icon: meta.icon, tone: meta.tone };
  });
  return <AttentionList rows={rows} />;
}
