import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { applyToInternship } from "@/server/internships/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  postingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  profile: z.object({ college: z.string().max(160), course: z.string().max(160), graduationYear: z.number().int(), availableFrom: z.string().max(10), availableTo: z.string().max(10) }),
  skills: z.array(z.string().max(60)).max(30).optional(),
  coverNote: z.string().max(2000).optional(),
  resumeFileId: z.string().regex(/^rf_[A-Za-z0-9_-]{8,40}$/),
  consent: z.literal(true),
  confirmed: z.boolean().optional(),
});

/**
 * Apply on an internship a company posted on WonderStar: the student's own press sends their Internships profile and
 * résumé to that company (gated by internships.apply on the server; once per internship and email), audited.
 */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await applyToInternship(s, b);
      await recordServerAudit(s.tenantId, { actionId: `internship-apply:${out.id}`, actionType: "internships.apply", event: "APPLICATION_SUBMITTED", detail: `${out.title} · ${out.company}` });
      after(out.notify);
      return { id: out.id, title: out.title, company: out.company };
    },
    { schema: Body, write: true },
  );
}
