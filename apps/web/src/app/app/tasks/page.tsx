"use client";
import { useMemo } from "react";
import { ListTodo } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { actionsRequired } from "@/domain/digest/build";
import { computeApplicationAttention } from "@/domain/career/attention";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { EmptyState } from "@/components/common/States";
import { AttentionList, type AttentionRow } from "@/components/career/AttentionList";
import { attentionRows } from "@/modules/jobs/pipeline/ApplicationAttentionList";
import { applicationHref } from "@/modules/jobs/pipeline/ApplicationCard";

/**
 * Needs attention (the top bar's checklist): one list of what needs the candidate — interviews, follow-ups,
 * materials to review, employer replies, offers, then what holds matching back (profile gaps, patterns to confirm) —
 * each with its one action. Worked out from the app's own state as it changes; the badge counts the same list.
 */
export default function TasksPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const now = useNow();
  const rows = useMemo<AttentionRow[]>(() => {
    const items = computeApplicationAttention(applications, now);
    const actions = actionsRequired({ dna, learnedSignals: learnedSignals ?? [], applications: Object.values(applications) });
    // "ready for your review" is already a row per application above.
    const profile = actions.filter((a) => a.href !== "/app/applications");
    return [
      ...attentionRows(items, jobs, applications, (id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)),
      ...profile.map((a) => ({ key: a.text, href: a.href ?? "/app/career-dna", label: a.text, icon: ListTodo, tone: "neutral" as const, action: { label: "Fix", href: a.href ?? "/app/career-dna" } })),
    ];
  }, [applications, jobs, dna, learnedSignals, now]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Needs attention" description={rows.length ? `${rows.length} ${rows.length === 1 ? "thing" : "things"} to do` : undefined} />
      {rows.length ? <AttentionList rows={rows} /> : <EmptyState title="Nothing needs you right now" body="Interviews coming up, follow-ups that are due, replies and offers show here." action={{ label: "Open Pipeline", href: "/app/applications" }} />}
    </div>
  );
}
