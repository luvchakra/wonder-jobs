import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { companyProfile } from "@/server/jobslake/companies";

export const runtime = "nodejs";

/**
 * GET ?d=domain&n=name — what JobsLake knows about a company (size and industry as TheirStack reports them, its
 * open and new postings, H-1B filings from the Department of Labor). Public, platform-wide data; 404 when none.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const u = new URL(req.url);
  const p = await companyProfile({ domain: u.searchParams.get("d")?.slice(0, 253) ?? undefined, name: u.searchParams.get("n")?.slice(0, 200) ?? undefined }).catch(() => undefined);
  if (!p) return NextResponse.json({ error: "No company data" }, { status: 404, headers: { "cache-control": "private, max-age=600" } });
  return NextResponse.json(p, { headers: { "cache-control": "private, max-age=600" } });
}
