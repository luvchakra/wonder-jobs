import type { Metadata } from "next";
import Link from "next/link";
import { applicationStatus, hostedSite } from "@/server/careers";
import { PRIVATE_PAGE } from "@/lib/robots";
import { HostedWithdraw } from "./HostedWithdraw";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The address carries the applicant's status token: never indexed, never sent on as a referrer.
export const metadata: Metadata = { title: "Your application", ...PRIVATE_PAGE, referrer: "no-referrer" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** An applicant's own status, from the link in their emails. Shows only the status, never notes or history. */
export default async function HostedStatusPage({ params, searchParams }: Props) {
  const [{ slug }, { t = "" }] = await Promise.all([params, searchParams]);
  const site = (await hostedSite(slug))!;
  const a = await applicationStatus(site, t).catch(() => null);
  return (
    <div className="max-w-xl">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-600">Your application</p>
      {a ? (
        <>
          <h1 className="mt-2 text-[26px] font-semibold tracking-tight">{a.jobTitle}</h1>
          <dl className="mt-5 grid grid-cols-[8rem_1fr] gap-y-2 rounded-[16px] border border-line bg-surface p-5 text-[14px]">
            <dt className="text-ink-3">Status</dt>
            <dd className="font-semibold">{a.statusLabel}</dd>
            <dt className="text-ink-3">Applied</dt>
            <dd>{when(a.appliedAt)}</dd>
            <dt className="text-ink-3">Last update</dt>
            <dd>{when(a.updatedAt)}</dd>
          </dl>
          <p className="mt-4 text-[13px] text-ink-3">{site.company} emails you at every step. To add something to your application, reply to any of those emails.</p>
          {a.canWithdraw && <HostedWithdraw slug={slug} token={t} />}
        </>
      ) : (
        <>
          <h1 className="mt-2 text-[24px] font-semibold">We couldn&apos;t find that application.</h1>
          <p className="mt-3 text-[14px] text-ink-3">Open the link in your confirmation email again; it must be complete.</p>
        </>
      )}
      <Link href={`/careers/${site.slug}`} className="mt-8 inline-block text-[14px] font-medium text-brand-600 hover:underline">
        See open positions
      </Link>
    </div>
  );
}
