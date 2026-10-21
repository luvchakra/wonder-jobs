import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { hostedSite } from "@/server/careers";

export const runtime = "nodejs";

/**
 * A company's careers page hosted by WonderJobs (owner, 2026-10-21): for companies that can't add an
 * integration to their own website. The company's name heads it; WonderJobs runs the applications behind it.
 */
export default async function HostedCareersLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const site = await hostedSite((await params).slug);
  if (!site) notFound();
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href={`/careers/${site.slug}`} className="inline-flex items-center gap-2 text-[18px] font-semibold text-ink">
            {site.company}
            {site.verified && <BadgeCheck className="size-5 text-brand-600" aria-label="Verified by WonderJobs" />}
          </Link>
          <span className="text-[13px] text-ink-3">Careers</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12px] text-ink-3 sm:px-6">
          <span>Careers page and applications handled by WonderJobs for {site.company}.</span>
          <WonderLogo size={20} href="/" />
        </div>
      </footer>
    </div>
  );
}
