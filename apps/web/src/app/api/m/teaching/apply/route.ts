import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { applyToTeachingRole } from "@/server/teaching/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const List = z.array(z.string().max(60)).max(12);
const Body = z.object({
  postingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  profile: z.object({ subjects: List, grades: List, boards: List, qualifications: List, languages: List, backgroundCheck: z.object({ has: z.boolean(), on: z.string().max(10).optional() }) }),
  skills: z.array(z.string().max(60)).max(30).optional(),
  coverNote: z.string().max(2000).optional(),
  resumeFileId: z.string().regex(/^rf_[A-Za-z0-9_-]{8,40}$/),
  consent: z.literal(true),
  confirmed: z.boolean().optional(),
});

/** Apply on a teaching role a school posted on WonderStar: gated by teaching.apply on the server; once per role and email; audited. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await applyToTeachingRole(s, b);
      await recordServerAudit(s.tenantId, { actionId: `teaching-apply:${out.id}`, actionType: "teaching.apply", event: "APPLICATION_SUBMITTED", detail: `${out.title} · ${out.company}` });
      after(out.notify);
      return { id: out.id, title: out.title, company: out.company };
    },
    { schema: Body, write: true },
  );
}
