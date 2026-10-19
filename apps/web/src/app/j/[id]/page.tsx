import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { SHARE_PITCH, shareFacts } from "@/domain/jobs/share";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { applyLink, excerpt, sharedJob } from "./data";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await sharedJob((await params).id);
  if (!job) return { title: "Job no longer listed", robots: { index: false } };
  const title = `${job.title} at ${job.company}`;
  const description = `${shareFacts(job)} — found with WonderJobs, the AI job-search agent.`;
  return { title, description, robots: { index: false }, openGraph: { title, description, type: "website", siteName: "WonderJobs" }, twitter: { card: "summary_large_image", title, description } };
}

/** A job someone shared (owner, 2026-10-19): the posting, the employer's link, and one invitation to WonderJobs. */
export default async function SharedJobPage({ params }: Props) {
  const job = await sharedJob((await params).id);
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6">
        {job ? (
          <article className="rounded-[20px] border border-line bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[12px] border border-line text-[20px] font-semibold text-brand-600">
                {job.company.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink-2">{job.company}</p>
                <h1 className="mt-0.5 text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">{job.title}</h1>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[14px] bg-surface-2 p-4 text-[13.5px]">
              <Fact label="Where">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {job.location}
                </span>
              </Fact>
              <Fact label="Work mode">{WORK_MODE_LABEL[job.workMode]}</Fact>
              <Fact label="Salary">{formatSalaryRange(job.salaryMin, job.salaryMax, job.currency) ?? <span className="text-ink-4">Not listed</span>}</Fact>
              <Fact label="Job type">{jobTypeOf(job) ? JOB_TYPE_LABEL[jobTypeOf(job)!] : <span className="text-ink-4">Not stated</span>}</Fact>
            </dl>
            {job.description && <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{excerpt(job.description)}</p>}
            <p className="mt-3 text-[12px] text-ink-4">Posted {relativeTime(job.postedAt)}{job.lake?.sightings.length ? ` · via ${job.lake.sightings[0].sourceName}` : ""}</p>
            {applyLink(job) && (
              <a href={applyLink(job)!} target="_blank" rel="nofollow noopener noreferrer" className="wj-gradient-bg mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-medium text-white shadow-brand hover:brightness-105">
                See the job on the employer&apos;s site <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
          </article>
        ) : (
          <div className="rounded-[20px] border border-line bg-surface p-6 text-center">
            <h1 className="text-[22px] font-semibold">This job is no longer listed</h1>
            <p className="mt-2 text-[14px] text-ink-3">It may have closed. WonderJobs can find others like it.</p>
          </div>
        )}
        <section aria-labelledby="wonder" className="mt-6 rounded-[20px] bg-gradient-to-br from-[#1b1740] to-[#241c4d] p-5 text-white sm:p-6">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#c4b5fd]">
            <Sparkles className="size-3.5" aria-hidden /> Found with WonderJobs
          </p>
          <h2 id="wonder" className="mt-2 text-[20px] font-semibold leading-snug">Find jobs that fit you, not just jobs.</h2>
          <p className="mt-1 text-[14px] text-white/75">{SHARE_PITCH}</p>
          <Link href="/sign-up" className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#1b1740] hover:bg-white/90">
            Start free
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
