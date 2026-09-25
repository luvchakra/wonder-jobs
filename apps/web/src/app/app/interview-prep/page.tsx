"use client";
import Link from "next/link";
import { CalendarDays, MessagesSquare } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/States";
import { formatDate, formatTime } from "@/lib/format";

export default function InterviewPrepPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const dna = useCareerStore((s) => s.dna);
  const interviews = Object.values(applications)
    .flatMap((a) => a.followUps.filter((f) => f.kind === "interview" && !f.done).map((f) => ({ a, f })))
    .sort((x, y) => x.f.dueAt.localeCompare(y.f.dueAt));
  return (
    <div>
      <PageHeader title="Interview Prep" description="A prep sheet for each upcoming interview, built from the role's requirements and your Career Profile." />
      {interviews.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-5" aria-hidden />} title="No interviews scheduled" body="When an application reaches the interview stage, its prep sheet appears here." action={{ label: "View applications", href: "/app/applications" }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {interviews.map(({ a, f }) => {
            const job = jobs[a.jobId];
            const matched = (job?.skills ?? []).filter((s) => dna.skills.some((d) => d.name.toLowerCase() === s.toLowerCase()));
            const gaps = (job?.skills ?? []).filter((s) => !matched.includes(s));
            return (
              <Card key={f.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{job?.title}</p>
                    <p className="text-[13px] text-ink-3">{job?.company}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[12px] font-medium text-blue-600">
                    <CalendarDays className="size-3.5" aria-hidden /> {formatDate(f.dueAt)} · {formatTime(f.dueAt)}
                  </span>
                </div>
                <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Lead with</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {matched.map((s) => (
                    <li key={s} className="rounded-full bg-success-100 px-2.5 py-1 text-[12px] font-medium text-success-600">
                      {s}
                    </li>
                  ))}
                  {dna.strengths.slice(0, 2).map((s) => (
                    <li key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">
                      {s}
                    </li>
                  ))}
                </ul>
                {gaps.length > 0 && (
                  <>
                    <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Prepare a story for</h3>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {gaps.map((s) => (
                        <li key={s} className="rounded-full bg-warning-100 px-2.5 py-1 text-[12px] font-medium text-warning-600">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3 className="mt-4 text-[13px] font-semibold text-ink-2">Likely questions</h3>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
                  <li>Walk me through a product you shipped end to end.</li>
                  <li>How do you decide what not to build?</li>
                  <li>{job?.requirements[1] ? `Tell us about your ${job.requirements[1].toLowerCase()}.` : "Tell us about a time you disagreed with a decision and what you did."}</li>
                  <li>What would you do in your first 90 days at {job?.company}?</li>
                </ol>
                <Link href={`/app/applications/${a.id}`} className="mt-4 inline-block text-[13px] font-medium text-brand-600 hover:underline">
                  Open application
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
