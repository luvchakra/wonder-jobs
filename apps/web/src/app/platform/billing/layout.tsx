import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/server/jobslake/access";
import { BillingNav } from "@/components/billing/admin/BillingNav";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Billing administration: plans, prices, discounts, JobsLake API pricing and their history. Same gate
 * as JobsLake: anyone who isn't a platform admin gets a 404. Every /api/billing/admin route enforces it too.
 */
export default async function BillingAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-[15px] font-semibold text-ink">Billing · Platform admin</p>
          <nav aria-label="Platform" className="flex gap-3 text-[13px]">
            <Link href="/platform/jobs-lake" className="text-ink-3 hover:text-ink">
              JobsLake
            </Link>
            <Link href="/platform/jobs-apply" className="text-ink-3 hover:text-ink">
              JobsApply
            </Link>
            <Link href="/app" className="text-ink-3 hover:text-ink">
              Back to WonderJobs
            </Link>
          </nav>
        </div>
        <BillingNav />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
