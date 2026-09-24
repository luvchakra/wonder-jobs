import { NextResponse } from "next/server";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { buildApplicationProfile, missingProfileFields } from "@/domain/jobs-apply/profile";
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
  phone: string;
  linkedinUrl: string;
  location: string;
  /** Fields an employer's form commonly asks for that WonderJobs genuinely doesn't hold yet — the extension tells the candidate to fill these by hand rather than guessing. */
  missing: string[];
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
 * The base profile the extension fills on a form that has no JobsApply session:
 * the candidate's own name, email, phone, LinkedIn and location from Career
 * Profile. Anything the profile doesn't hold is reported as `missing` for the
 * candidate to type themselves; the extension never invents it.
 */
export async function GET(req: Request) {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderJobs again." }, { status: 401, headers: { "cache-control": "no-store" } });
  const rl = rateLimit(`ext-profile:${tenantId}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const career = await readClientState<{ dna?: CareerDNA }>(tenantId, "wj.career");
  const dna = career?.dna;
  const p = buildApplicationProfile(dna ?? EMPTY_DNA, { accountEmail: await accountEmail(tenantId) });
  const missing = missingProfileFields(p).map((m) => (m === "Your name" ? "Your name (add it to Career Profile)" : m));
  const val = (k: keyof typeof p) => p[k]?.value ?? "";
  const profile: AutofillProfile = { fullName: val("fullName"), firstName: val("firstName"), lastName: val("lastName"), email: val("email"), headline: dna?.headline?.trim() ?? "", phone: val("phone"), linkedinUrl: val("linkedinUrl"), location: val("location"), missing };
  return NextResponse.json(profile, { headers: { "cache-control": "no-store" } });
}
