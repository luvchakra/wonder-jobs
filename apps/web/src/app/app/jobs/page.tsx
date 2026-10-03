import { redirect } from "next/navigation";

/** The job list lives at /app now; old links (?fit=, ?saved=, ?q=) keep working. */
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  const qs = params.toString();
  redirect(qs ? `/app?${qs}` : "/app");
}
