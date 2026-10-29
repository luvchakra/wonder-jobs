import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { SHARE_PITCH, shareFacts } from "@/domain/jobs/share";
import { authConfigured } from "@/lib/auth/config";
import { getSession } from "@/server/auth";
import { applyLink, sharedJob } from "./data";
import { SharedJobView } from "./SharedJobView";

export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await sharedJob((await params).id);
  if (!job) return { title: "Job no longer listed", robots: { index: false } };
  const title = `${job.title} at ${job.company}`;
  const description = `${shareFacts(job)} — found with WonderWorks, the AI job-search agent.`;
  return { title, description, robots: { index: false }, openGraph: { title, description, type: "website", siteName: "WonderWorks" }, twitter: { card: "summary_large_image", title, description } };
}

/** A job someone shared (owner, 2026-10-20): the posting laid out as it is in the app, with an account asked for only when an action needs one. */
export default async function SharedJobPage({ params }: Props) {
  const { id } = await params;
  // Someone already signed in goes straight to the job inside the app.
  if (authConfigured() && (await getSession().catch(() => null))) redirect(`/app/jobs/${encodeURIComponent(decodeURIComponent(id))}`);
  const job = await sharedJob(id);
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        {job ? (
          <SharedJobView
            job={{ id: job.id, title: job.title, company: job.company, companyDomain: job.companyDomain, location: job.location, workMode: job.workMode, salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency, jobType: job.jobType, jobTypeFrom: job.jobTypeFrom, postedAt: job.postedAt, description: job.description ?? "", requirements: job.requirements ?? [], niceToHave: job.niceToHave ?? [], skills: job.skills ?? [], industry: job.industry ?? "", applyUrl: job.applyUrl, sources: [...new Set(job.lake?.sightings.map((x) => x.sourceName) ?? [])] }}
            applyUrl={applyLink(job)}
          />
        ) : (
          <div className="mx-auto max-w-2xl rounded-[20px] border border-line bg-surface p-6 text-center">
            <h1 className="text-[22px] font-semibold">This job is no longer listed</h1>
            <p className="mt-2 text-[14px] text-ink-3">It may have closed. WonderWorks can find others like it.</p>
          </div>
        )}
        <section aria-labelledby="wonder" className="mx-auto mt-6 max-w-5xl rounded-[20px] bg-gradient-to-br from-[#1E1B4B] to-[#4C1D95] p-5 text-white sm:p-6">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#c4b5fd]">
            <Sparkles className="size-3.5" aria-hidden /> Found with WonderWorks
          </p>
          <h2 id="wonder" className="mt-2 text-[20px] font-semibold leading-snug">Find jobs that fit you, not just jobs.</h2>
          <p className="mt-1 text-[14px] text-white/75">{SHARE_PITCH}</p>
          <Link href="/sign-up" className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#1E1B4B] hover:bg-white/90">
            Start free
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
