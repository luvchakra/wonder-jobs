import type { Metadata } from "next";
import Link from "next/link";
import { careerApplicationStatus } from "@/server/careerSite/client";
import { PRIVATE_PAGE } from "@/lib/robots";
import { WithdrawApplication } from "@/components/careers/WithdrawApplication";
import { CareersNotice, CareersShell } from "../_site/Shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The address carries the applicant's token: never indexed, never passed on as a referrer (the header is set in next.config.ts too).
export const metadata: Metadata = { title: "Your application", ...PRIVATE_PAGE, referrer: "no-referrer" };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const NOT_FOUND = "We couldn't find that application. Use the link in your email.";

/** An applicant's own status, from their email's link. The token is sent on in a request body, never an address. */
export default async function CareersStatusPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const raw = (await searchParams).t;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const r = token ? await careerApplicationStatus(token, "view") : ({ state: "not_found" } as const);
  if (r.state !== "ok" && r.state !== "not_found" && r.state !== "rejected")
    return (
      <CareersShell>
        <CareersNotice title="This page is unavailable right now" body="We couldn't load your application. Please try again later." />
      </CareersShell>
    );
  return (
    <CareersShell>
      <div className="max-w-xl">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">Your application</p>
        {r.state === "ok" ? (
          <>
            <h1 className="mt-2 break-words text-[26px] font-semibold tracking-tight">{r.data.jobTitle}</h1>
            <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-2 rounded-[16px] border border-line bg-surface p-5 text-[14px]">
              <dt className="text-ink-3">Company</dt>
              <dd>{r.data.company}</dd>
              <dt className="text-ink-3">Status</dt>
              <dd className="font-semibold">{r.data.statusLabel}</dd>
              <dt className="text-ink-3">Applied</dt>
              <dd>{when(r.data.appliedAt)}</dd>
              <dt className="text-ink-3">Last update</dt>
              <dd>{when(r.data.updatedAt)}</dd>
            </dl>
            {r.data.canWithdraw && <WithdrawApplication token={token} />}
          </>
        ) : (
          <h1 className="mt-2 text-[22px] font-semibold">{NOT_FOUND}</h1>
        )}
        <Link href="/careers" className="mt-8 inline-block text-[14px] font-medium text-brand-600 hover:underline">
          See open positions
        </Link>
      </div>
    </CareersShell>
  );
}
