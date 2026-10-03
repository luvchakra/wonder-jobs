import { redirect } from "next/navigation";

/** The app opens on Find. Old links (/app?search=…, ?role=, ?refresh=, ?fit=, ?q=) keep working. */
export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  redirect(params.size ? `/app/jobs?${params}` : "/app/jobs");
}
