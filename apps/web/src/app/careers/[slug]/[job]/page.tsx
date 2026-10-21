import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatSalaryRange } from "@/lib/format";
import { hostedSite, siteJob } from "@/server/careers";
import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from "../labels";
import { HostedApplyForm } from "./HostedApplyForm";

export const runtime = "nodejs";
export const revalidate = 60;

type Props = { params: Promise<{ slug: string; job: string }> };

async function load(params: Props["params"]) {
  const { slug, job } = await params;
  const site = await hostedSite(slug);
  const j = site ? await siteJob(site, decodeURIComponent(job)) : null;
  return site && j ? { site, job: j } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { title: "Position not found", robots: { index: false } };
  const title = `${r.job.title} at ${r.site.company}`;
  const description = r.job.description.replace(/\s+/g, " ").slice(0, 160);
  return { title, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary", title, description } };
}

export default async function HostedJobPage({ params }: Props) {
  const r = await load(params);
  if (!r) notFound();
  const { site, job } = r;
  // Search engines read this to list the job in Google for Jobs.
  const posting = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.updatedAt,
    hiringOrganization: { "@type": "Organization", name: site.company },
    jobLocation: { "@type": "Place", address: job.location },
    ...(job.workMode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(posting).replace(/</g, "\\u003c") }} />
      <Link href={`/careers/${site.slug}`} className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All positions
      </Link>
      <h1 className="mt-5 text-[28px] font-semibold tracking-tight sm:text-[34px]">{job.title}</h1>
      <p className="mt-2 text-[14px] text-ink-3">{[job.location, WORK_MODE_LABEL[job.workMode], job.jobType ? JOB_TYPE_LABEL[job.jobType] : undefined, formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)].filter(Boolean).join(" · ")}</p>
      <a href="#apply" className="mt-5 inline-flex h-10 items-center rounded-full bg-brand-600 px-6 text-[14px] font-medium text-white hover:bg-brand-700">
        Apply
      </a>
      <div className="mt-8 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{job.description}</div>
      {job.skills.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Skills">
          {job.skills.map((s) => (
            <li key={s} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-3">
              {s}
            </li>
          ))}
        </ul>
      )}
      <section id="apply" className="mt-12 scroll-mt-6 rounded-[16px] border border-line bg-surface p-5 sm:p-7">
        <h2 className="text-[20px] font-semibold">Apply for this position</h2>
        <HostedApplyForm slug={site.slug!} jobId={job.id} company={site.company} retentionMonths={site.retentionMonths} />
      </section>
    </>
  );
}
