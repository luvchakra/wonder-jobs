import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/server/jobslake/access";

export const metadata: Metadata = { title: "JobsApply", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** JobsApply operations (spec §79). Same gate as JobsLake: non-admins get a 404. */
export default async function JobsApplyAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-[15px] font-semibold text-ink">JobsApply · Platform admin</p>
          <nav aria-label="Platform" className="flex gap-3 text-[13px]">
            <Link href="/platform/jobs-lake" className="text-ink-3 hover:text-ink">
              JobsLake
            </Link>
            <Link href="/app" className="text-ink-3 hover:text-ink">
              Back to WonderJobs
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
