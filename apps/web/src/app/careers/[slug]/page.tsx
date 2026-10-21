import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatSalaryRange } from "@/lib/format";
import { hostedSite, siteJobsList } from "@/server/careers";
import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from "./labels";

export const runtime = "nodejs";
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await hostedSite((await params).slug);
  return site ? { title: `Careers at ${site.company}`, description: `Open positions at ${site.company}. Apply online.` } : { title: "Careers" };
}

/** The company's open positions: the jobs it linked to this hosted page while they're open. */
export default async function HostedCareersPage({ params }: Props) {
  const site = (await hostedSite((await params).slug))!;
  const jobs = await siteJobsList(site);
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">Work at {site.company}</h1>
      <p className="mt-2 text-[15px] text-ink-2">{jobs.length ? `${jobs.length} open position${jobs.length === 1 ? "" : "s"}.` : "There are no open positions right now. Check back soon."}</p>
      {jobs.length > 0 && (
        <ul className="mt-8 overflow-hidden rounded-[16px] border border-line bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="border-b border-line last:border-b-0">
              <Link href={`/careers/${site.slug}/${encodeURIComponent(j.id)}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink">{j.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">{[j.location, WORK_MODE_LABEL[j.workMode], j.jobType ? JOB_TYPE_LABEL[j.jobType] : undefined, formatSalaryRange(j.salaryMin, j.salaryMax, j.currency)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600">
                  <span className="hidden sm:inline">View &amp; apply</span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
