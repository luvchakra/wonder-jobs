import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCareerJob } from "@/server/careerSite/client";
import { CareersApplyForm } from "@/components/careers/CareersApplyForm";
import { ShareJobLink } from "@/components/careers/ShareJobLink";
import { CareersNotice, CareersShell } from "./Shell";
import { unavailableState } from "./state";
import { jobFacts, jobPostingJsonLd } from "./meta";

export async function careerJobMetadata(id: string): Promise<Metadata> {
  const r = await getCareerJob(id);
  if (r.state !== "ok") return { title: "Careers at WonderWorks", robots: { index: false } };
  const title = `${r.data.job.title} at ${r.data.job.company}`;
  const description = r.data.job.description.replace(/\s+/g, " ").slice(0, 160);
  return { title, description, openGraph: { title, description, type: "website" } };
}

/** One of WonderJobs' own open positions: the description (plain text, rendered as text), Share and the apply form. */
export async function CareerJobPage({ id }: { id: string }) {
  const r = await getCareerJob(id);
  if (r.state === "not_found")
    return (
      <CareersShell>
        <div className="max-w-xl">
          <h1 className="text-[26px] font-semibold tracking-tight">This position is no longer open</h1>
          <Link href="/careers" className="mt-5 inline-block text-[14px] font-medium text-brand-600 hover:underline">
            See open positions
          </Link>
        </div>
      </CareersShell>
    );
  if (r.state !== "ok") {
    const s = await unavailableState(r);
    return (
      <CareersShell>
        <CareersNotice title={s.title} body={s.body} adminReason={s.adminReason} retry={s.retry ? `/careers/${encodeURIComponent(id)}` : undefined} />
      </CareersShell>
    );
  }
  const { job, site } = r.data;
  return (
    <CareersShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jobPostingJsonLd(job) }} />
      <Link href="/careers" className="inline-flex min-h-10 items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All positions
      </Link>
      <h1 className="mt-3 break-words text-[28px] font-semibold tracking-tight sm:text-[34px]">{job.title}</h1>
      <p className="mt-2 text-[14px] text-ink-3">{[job.company, jobFacts(job)].filter(Boolean).join(" · ")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a href="#apply" className="inline-flex h-10 items-center rounded-full bg-brand-600 px-6 text-[14px] font-medium text-white hover:bg-brand-700">
          Apply
        </a>
        <ShareJobLink title={`${job.title} at ${job.company}`} />
      </div>
      <div className="mt-8 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-2">{job.description}</div>
      {job.skills.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Skills">
          {job.skills.map((s) => (
            <li key={s} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-3">
              {s}
            </li>
          ))}
        </ul>
      )}
      <section id="apply" aria-labelledby="apply-title" className="mt-12 scroll-mt-6 rounded-[16px] border border-line bg-surface p-5 sm:p-7">
        <h2 id="apply-title" className="text-[20px] font-semibold">
          Apply for this position
        </h2>
        <CareersApplyForm jobId={job.id} retentionMonths={site.retentionMonths} />
      </section>
    </CareersShell>
  );
}
