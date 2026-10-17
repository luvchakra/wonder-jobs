import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { refreshCompanies } from "@/server/jobslake/companyRefresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * JobsLake's daily company refresh: every company its last two weeks of postings name a domain for, how many
 * postings each has, and the logos still missing (`refreshCompanies`). Vercel Cron calls it with
 * `CRON_SECRET` as `Authorization: Bearer …`; with no secret configured it refuses to run.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const report = await refreshCompanies({ budgetMs: 45_000 });
    console.info("[jobslake-companies]", JSON.stringify(report));
    return NextResponse.json(report);
  } catch (e) {
    console.warn("[jobslake-companies] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The company refresh failed" }, { status: 500 });
  }
}
