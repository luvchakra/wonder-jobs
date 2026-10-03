import { redirect } from "next/navigation";

/**
 * Find opportunities folded into the jobs screen: its search box searches every source for your words,
 * and a role's chip searches as that role. Old links keep working — `?q=` becomes a search for those
 * words, `?role=` a search as that role.
 */
export default async function FindPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const q = typeof p.q === "string" ? p.q.trim() : "";
  const role = typeof p.role === "string" ? p.role : "";
  redirect(role ? `/app?role=${encodeURIComponent(role)}` : q ? `/app?search=${encodeURIComponent(q)}` : "/app");
}
