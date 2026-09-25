"use client";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";
import { compareJobs } from "@/domain/jobs/compare";
import { useJobsStore } from "@/store/jobs";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { EmptyState, PageLoading } from "@/components/common/States";
import { CompanyLogo } from "@/components/common/Avatar";
import { companyColor } from "@/components/jobs/JobCard";

/**
 * Compare 2–4 opportunities side by side (outcome spec §13). Every cell is a job's own computed
 * reason or signal; the observations say which role is closer on a given dimension and never pick
 * an overall winner — the candidate decides.
 */
function CompareInner() {
  const params = useSearchParams();
  const jobsById = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const jobs = ids.map((id) => jobsById[id]).filter(Boolean);
  const result = useMemo(() => compareJobs(jobs, matches, quality), [jobs, matches, quality]);

  if (jobs.length < 2) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/jobs", label: "Jobs" }} title="Compare opportunities" />
        <EmptyState icon={<Scale className="size-5" aria-hidden />} title="Pick at least two opportunities" body="Tick “Compare” on two to four jobs in your results, then compare them here." action={{ label: "Go to jobs", href: "/app/jobs" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader back={{ href: "/app/jobs", label: "Jobs" }} title="Compare opportunities" description="How each role lines up with your Career Profile. Wonder points out real differences — the choice is yours." />
      {result.observations.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-[15px] font-semibold text-ink">What stands out</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.observations.map((o) => (
              <li key={o} className="text-[14px] text-ink-2">
                {o}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <caption className="wj-sr-only">Side-by-side comparison of {jobs.length} opportunities</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-40 p-3 text-[12px] font-semibold text-ink-3">
                Dimension
              </th>
              {jobs.map((j) => (
                <th key={j.id} scope="col" className="p-3 align-top">
                  <Link href={`/app/jobs/${j.id}`} className="flex items-center gap-2 hover:underline">
                    <CompanyLogo name={j.company} color={companyColor(j.company)} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">{j.title}</span>
                      <span className="block truncate text-[12px] font-normal text-ink-3">{j.company}</span>
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 align-top text-[13px] font-medium text-ink-2">
                  {row.label}
                </th>
                {row.values.map((v, i) => (
                  <td key={jobs[i].id} className="p-3 align-top text-ink-2">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-ink-4">“Industry” stands in for company preference: Wonder compares each employer&apos;s industry with the target industries in your Career Profile — it doesn&apos;t rank companies on anything else.</p>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CompareInner />
    </Suspense>
  );
}
