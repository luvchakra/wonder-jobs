import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listCareerJobs } from "@/server/careerSite/client";
import { CareersNotice, CareersShell } from "./_site/Shell";
import { unavailableState } from "./_site/state";
import { jobFacts } from "./_site/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Careers at WonderStar", description: "Open positions at WonderStar. Apply online." };

/** WonderJobs' own open positions, read from the careers API (never sample or stored jobs). */
export default async function CareersPage() {
  const r = await listCareerJobs();
  if (r.state !== "ok") {
    const s = await unavailableState(r, { forAdmins: true });
    return (
      <CareersShell>
        <CareersNotice title={s.title} body={s.body} adminReason={s.adminReason} retry={s.retry ? "/careers" : undefined} />
      </CareersShell>
    );
  }
  const { jobs } = r.data;
  return (
    <CareersShell>
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">Work at WonderStar</h1>
      {jobs.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-2">No open positions right now</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-[16px] border border-line bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="border-b border-line last:border-b-0">
              <Link href={`/careers/${encodeURIComponent(j.id)}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink">{j.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">{jobFacts(j)}</span>
                  {j.skills.length > 0 && <span className="mt-1 block truncate text-[12px] text-ink-4">{j.skills.join(", ")}</span>}
                </span>
                <ArrowRight className="size-4 shrink-0 text-brand-600 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CareersShell>
  );
}
