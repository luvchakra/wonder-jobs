import { NextResponse } from "next/server";
import { z } from "zod";
import { ID_KINDS } from "@/domain/jobs-apply/sensitive";
import { getSensitive, putSensitive } from "@/server/jobsApply/sensitive";
import { requireSession } from "@/server/auth";

export const runtime = "nodejs";

const s = (n: number) => z.string().trim().max(n).optional();
const Body = z
  .object({
    answers: z
      .object({ gender: s(80), pronouns: s(40), ethnicity: s(120), veteran: s(120), disability: s(120), authorizedCountries: z.array(z.string().trim().min(1).max(60)).max(20).optional(), criminalRecord: s(40), agreeDeclarations: z.boolean().optional() })
      .strict()
      .optional(),
    ids: z.partialRecord(z.enum(ID_KINDS), z.string().trim().max(40).nullable()).optional(),
  })
  .strict();

/** GET: the signed-in candidate's own sensitive answers, ID numbers masked. PUT: save them. Never cached. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await getSensitive(session.tenantId), { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const tenantId = session.tenantId;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those answers couldn't be saved." }, { status: 400 });
  await putSensitive(tenantId, parsed.data);
  return NextResponse.json(await getSensitive(tenantId), { headers: { "cache-control": "no-store" } });
}
