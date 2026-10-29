import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLive, moduleById } from "@/modules/registry";

/**
 * The app opens on Find: Jobs', or the WonderStar module picked last in Find's menu (its cookie, set by store/ui.ts).
 * Old links (/app?search=…, ?role=, ?refresh=, ?fit=, ?q=) keep working and always open Jobs.
 */
export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  if (params.size) redirect(`/app/jobs?${params}`);
  const m = moduleById((await cookies()).get("wj_module")?.value ?? "");
  redirect(m && m.id !== "jobs" && isLive(m) ? m.routes.find : "/app/jobs");
}
