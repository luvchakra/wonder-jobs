"use client";
import { useMemo } from "react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { computeApplicationAttention } from "@/domain/career/attention";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/States";
import { ApplicationAttentionList } from "@/components/applications/ApplicationAttentionList";
import { applicationHref } from "@/components/applications/ApplicationCard";

/** Tasks (the top bar's checklist): what needs you across your applications — interviews, follow-ups, materials to review. */
export default function TasksPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const now = useNow();
  const items = useMemo(() => computeApplicationAttention(applications, now), [applications, now]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Needs attention" />
      {items.length ? (
        <ApplicationAttentionList items={items} jobs={jobs} hrefFor={(id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)} />
      ) : (
        <EmptyState title="Nothing needs you right now" body="Interviews coming up, follow-ups that are due and materials ready for your review show here." action={{ label: "Open Pipeline", href: "/app/applications" }} />
      )}
    </div>
  );
}
