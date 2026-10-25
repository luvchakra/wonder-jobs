"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { actionsRequired } from "@/domain/digest/build";
import { Card } from "@/components/common/Card";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { computeApplicationAttention } from "@/domain/career/attention";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/States";
import { ApplicationAttentionList } from "@/components/applications/ApplicationAttentionList";
import { applicationHref } from "@/components/applications/ApplicationCard";

/** Tasks (the top bar's checklist): what needs you across your applications — interviews, follow-ups, materials to review — then Actions required (profile gaps, patterns to confirm). */
export default function TasksPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const now = useNow();
  const items = useMemo(() => computeApplicationAttention(applications, now), [applications, now]);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const actions = useMemo(() => actionsRequired({ dna, learnedSignals: learnedSignals ?? [], applications: Object.values(applications) }), [dna, learnedSignals, applications]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Needs attention" />
      {items.length ? (
        <ApplicationAttentionList items={items} jobs={jobs} hrefFor={(id) => (applications[id] ? applicationHref(applications[id]) : `/app/applications/${id}`)} />
      ) : (
        <EmptyState title="Nothing needs you right now" body="Interviews coming up, follow-ups that are due and materials ready for your review show here." action={{ label: "Open Pipeline", href: "/app/applications" }} />
      )}
      {actions.length > 0 && (
        <Card className="mt-4" aria-labelledby="actions-required">
          <h2 id="actions-required" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ListTodo className="size-4 text-brand-600" aria-hidden /> Actions required
          </h2>
          <ul className="flex flex-col gap-2">
            {actions.map((i) => (
              <li key={i.text} className="flex items-start gap-2 text-[13px] leading-snug">
                <ListTodo className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                {i.href ? (
                  <Link href={i.href} className="min-w-0 flex-1 text-ink hover:underline">
                    {i.text}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 text-ink-2">{i.text}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
