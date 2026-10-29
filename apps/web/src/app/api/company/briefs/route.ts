import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { companyBriefs } from "@/server/jobslake/companies";

export const runtime = "nodejs";

/**
 * POST { companies: [{ d?: domain, n: name }] } (at most 60) — each company's size and H-1B filings for job
 * cards, keyed by `briefKey`. Public, platform-wide data; companies WorksLake knows nothing about are left out.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = (await req.json().catch(() => null)) as { companies?: unknown } | null;
  const list = Array.isArray(body?.companies) ? body.companies : [];
  const qs = list
    .slice(0, 60)
    .filter((c): c is { d?: unknown; n: string } => !!c && typeof (c as { n?: unknown }).n === "string")
    .map((c) => ({ n: c.n.slice(0, 200), ...(typeof c.d === "string" && c.d ? { d: c.d.slice(0, 253) } : {}) }));
  const briefs = await companyBriefs(qs).catch(() => ({}));
  return NextResponse.json({ briefs });
}
