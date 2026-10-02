import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { eraseAccount } from "@/server/privacy/subjectRights";
import { ERASE_PHRASE } from "@/content/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ confirm: z.literal(ERASE_PHRASE) }).strict();

/** Delete the account and its data (GDPR Art. 17, DPDP s.12). See `eraseAccount` for what is kept and why. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`privacy-erase:${session.tenantId}`, { capacity: 3, refillPerSec: 1 / 600 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  if (!Body.safeParse(await req.json().catch(() => null)).success) return NextResponse.json({ error: `Type ${ERASE_PHRASE} to confirm.` }, { status: 400 });
  const result = await eraseAccount(session);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const res = NextResponse.json({ erased: true });
  // The session belongs to an identity that no longer exists: clear every auth cookie on the way out.
  for (const c of req.headers.get("cookie")?.split(";") ?? []) {
    const name = c.split("=")[0]?.trim();
    if (name && /^(wj-auth(\.\d+)?|wj_user|wj_uid|wj-auth-code-verifier)$/.test(name)) res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
