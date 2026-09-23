import { NextResponse } from "next/server";
import type { CareerDNA } from "@/domain/career/types";
import { MISSING_CANDIDATE_FIELDS } from "@/domain/career/missingFields";
import { readClientState } from "@/server/clientState";
import { tenantFromAuthHeader } from "@/server/extensionToken";
import { rateLimit } from "@/server/rateLimit";
import { getSupabaseAdmin } from "@/server/supabase";

export const runtime = "nodejs";

/** Everything below comes from the candidate's own Career DNA or their account — nothing is inferred to fill a gap. */
interface AutofillProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  headline: string;
  /** Fields an employer's form commonly asks for that WonderJobs genuinely doesn't hold yet — the extension tells the candidate to fill these by hand rather than guessing. */
  missing: string[];
}

/** "Priya Raman Iyer" → first "Priya", last "Raman Iyer". A single word is a first name with no surname, not a made-up one. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function accountEmail(tenantId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  if (!sb) return "";
  const { data, error } = await sb.auth.admin.getUserById(tenantId);
  if (error || !data?.user?.email) return "";
  return data.user.email;
}

/**
 * GET /api/extension/profile — bearer token from `/api/extension/token`.
 *
 * The base profile the extension fills on every application form. Career DNA
 * holds no phone number, address or LinkedIn URL today, so those are reported
 * as `missing` for the candidate to type themselves; the extension never
 * invents them.
 */
export async function GET(req: Request) {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderJobs again." }, { status: 401, headers: { "cache-control": "no-store" } });
  const rl = rateLimit(`ext-profile:${tenantId}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const career = await readClientState<{ dna?: CareerDNA }>(tenantId, "wj.career");
  const dna = career?.dna;
  const fullName = dna?.name?.trim() ?? "";
  const email = await accountEmail(tenantId);
  // Career DNA has no field for any of these yet, so they can never be filled — say so instead of guessing.
  const missing = [...MISSING_CANDIDATE_FIELDS];
  if (!fullName) missing.unshift("Your name (add it to Career DNA)");
  if (!email) missing.unshift("Email");

  const profile: AutofillProfile = { fullName, ...splitName(fullName), email, headline: dna?.headline?.trim() ?? "", missing };
  return NextResponse.json(profile, { headers: { "cache-control": "no-store" } });
}
