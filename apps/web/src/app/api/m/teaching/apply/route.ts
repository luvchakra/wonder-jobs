import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { applyToOpening } from "@/server/teaching/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  postingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  profile: z.object({ subjects: z.array(z.string().max(60)).max(8), grades: z.array(z.string().max(20)).max(6), boards: z.array(z.string().max(20)).max(5), qualifications: z.array(z.string().max(60)).max(10), languages: z.array(z.string().max(40)).max(8) }),
  coverNote: z.string().max(2000).optional(),
  resumeFileId: z.string().regex(/^rf_[A-Za-z0-9_-]{8,40}$/),
  consent: z.literal(true),
  confirmed: z.boolean().optional(),
});

/**
 * Apply on an opening a school posted on WonderWorks: the teacher's own press sends their Teaching details and résumé
 * to that school (gated by teaching.apply on the server; once per opening and email), audited.
 */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await applyToOpening(s, b);
      await recordServerAudit(s.tenantId, { actionId: `teaching-apply:${out.id}`, actionType: "teaching.apply", event: "APPLICATION_SUBMITTED", detail: `${out.title} · ${out.company}` });
      after(out.notify);
      return { id: out.id, title: out.title, company: out.company };
    },
    { schema: Body, write: true },
  );
}
