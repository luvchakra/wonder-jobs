import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/server/jobslake/access";
import { JobsLakeShell } from "@/components/jobslake/Shell";

export const metadata: Metadata = { title: "JobsLake", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The JobsLake admin portal. Anyone who isn't a platform admin — signed out, a candidate, or with the
 * admin flag off — gets a 404, so the portal's existence isn't advertised. The admin API enforces
 * the same rule on every request; this gate is for the pages.
 */
export default async function JobsLakeLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return <JobsLakeShell actor={admin.actor}>{children}</JobsLakeShell>;
}
