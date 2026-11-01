import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRIVATE_PAGE } from "@/lib/robots";
import { currentAdmin } from "@/server/jobslake/access";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "WonderWorks Admin", template: "%s · WonderWorks Admin" }, ...PRIVATE_PAGE };
export const dynamic = "force-dynamic";

/**
 * Every WonderWorks admin page (data, operations, accounts, billing, settings) in one shell. Anyone who isn't a
 * platform admin — signed out, a candidate, or with the admin flag off — gets a 404, so the pages'
 * existence isn't advertised. Every admin API route enforces the same rule on its own.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return <AdminShell actor={admin.actor}>{children}</AdminShell>;
}
