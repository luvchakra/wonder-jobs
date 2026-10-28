import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanApplication } from "@/domain/org/careers";
import { submitCareerApplication } from "@/server/careerSite/client";
import { respond } from "@/server/careerSite/respond";
import { rateLimit } from "@/server/rateLimit";
import { clientAddress } from "@/server/activityWatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().max(400).optional(),
  email: z.string().max(400).optional(),
  phone: z.string().max(200).optional(),
  location: z.string().max(400).optional(),
  linkedinUrl: z.string().max(1000).optional(),
  resumeUrl: z.string().max(1000).optional(),
  coverNote: z.string().max(8000).optional(),
  consent: z.boolean().optional(),
  // Hidden from people; anything typed here is a bot, which is told it worked and goes nowhere.
  website: z.string().max(500).optional(),
});

/**
 * An applicant applies on WonderStar' own careers page (/careers/<job id>). Checked here, then forwarded to the
 * careers API; this app keeps nothing and logs nothing from the body. Cross-site posts are refused by the proxy.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rl = rateLimit(`careers-site:apply:${clientAddress(req.headers)}`, { capacity: 10, refillPerSec: 10 / 3600 });
  if (!rl.ok) return NextResponse.json({ error: "Too many applications from here. Please try again later." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  const { website, ...input } = parsed.data;
  if (website?.trim()) return NextResponse.json({ ok: true });
  const check = cleanApplication({ name: input.name ?? "", email: input.email ?? "", phone: input.phone, location: input.location, linkedinUrl: input.linkedinUrl, resumeUrl: input.resumeUrl, coverNote: input.coverNote, consent: input.consent === true });
  if ("problem" in check) return NextResponse.json({ error: check.problem }, { status: 400 });
  const v = check.value;
  const r = await submitCareerApplication(id, {
    name: v.name,
    email: v.email,
    resumeUrl: v.resumeUrl,
    consent: true,
    ...(v.phone ? { phone: v.phone } : {}),
    ...(v.location ? { location: v.location } : {}),
    ...(v.linkedinUrl ? { linkedinUrl: v.linkedinUrl } : {}),
    ...(v.coverNote ? { coverNote: v.coverNote } : {}),
  });
  return respond(r, () => ({ ok: true }), { notFound: "This position is no longer open." });
}
