import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { easyApply } from "@/server/careers";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  listingIds: z.array(z.string().max(120)).min(1).max(20),
  name: z.string().max(200),
  phone: z.string().max(60).optional(),
  location: z.string().max(200).optional(),
  linkedinUrl: z.string().max(600).optional(),
  coverNote: z.string().max(4000).optional(),
  resumeFileId: z.string().regex(/^rf_[A-Za-z0-9_-]{8,40}$/),
  consent: z.literal(true),
  answers: z.record(z.string().max(60), z.union([z.string().max(600), z.number()])).optional(),
  profile: z.object({ headline: z.string().max(400).optional(), skills: z.array(z.string().max(120)).max(60).optional(), yearsExperience: z.number().optional() }).optional(),
});

/**
 * WonderJobs Easy Apply: the candidate's press sends their application to the company that posted the job on
 * WonderJobs. Submitted once per job and email (the database refuses a second); audited; the company's and the
 * candidate's emails go out after the answer.
 */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await easyApply(s, b);
      await recordServerAudit(s.tenantId, { actionId: `easy-apply:${out.id}`, actionType: "easy_apply", event: "APPLICATION_SUBMITTED", detail: `${out.jobTitle} · ${out.company}` });
      after(out.notify);
      return { id: out.id, jobTitle: out.jobTitle, company: out.company };
    },
    { schema: Body, write: true },
  );
}
