import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { applyToScholarship } from "@/server/scholarships/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  postingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  profile: z.record(z.string(), z.unknown()),
  answers: z.record(z.string().max(40), z.string().max(2000)).optional(),
  statement: z.string().max(4000).optional(),
  shareSensitive: z.boolean().optional(),
  resumeFileId: z.string().regex(/^rf_[A-Za-z0-9_-]{8,40}$/).optional(),
  consent: z.literal(true),
  confirmed: z.boolean().optional(),
});

/**
 * Apply on a scholarship or project an organisation posted on WonderWorks: the student's own press sends their profile,
 * answers and (optionally) résumé to that organisation (gated by scholarships.apply on the server; once per listing and
 * email), audited.
 */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await applyToScholarship(s, b);
      await recordServerAudit(s.tenantId, { actionId: `scholarship-apply:${out.id}`, actionType: "scholarships.apply", event: "APPLICATION_SUBMITTED", detail: `${out.title} · ${out.company}` });
      after(out.notify);
      return { id: out.id, title: out.title, company: out.company };
    },
    { schema: Body, write: true },
  );
}
