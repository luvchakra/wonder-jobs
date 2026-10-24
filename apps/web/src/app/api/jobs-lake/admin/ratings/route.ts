import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { companyStore } from "@/server/jobslake/companies";
import { ratingKeyStore } from "@/server/jobslake/ratingKeys";
import { RATINGS_TTL_MS } from "@/server/jobslake/ratingsJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Explorium keys (masked, never the secret) in the order they're spent, and how many companies have ratings. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [keys, coverage] = await Promise.all([ratingKeyStore().list(), companyStore().ratingsCoverage(new Date(Date.now() - RATINGS_TTL_MS).toISOString())]);
  return json({ keys, coverage });
}
