import { after } from "next/server";
import { z } from "zod";
import { careersRoute } from "@/server/careersRoute";
import { submitApplication } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().max(200),
  email: z.string().max(200),
  phone: z.string().max(60).optional(),
  location: z.string().max(200).optional(),
  linkedinUrl: z.string().max(600).optional(),
  resumeUrl: z.string().max(600).optional(),
  coverNote: z.string().max(5000).optional(),
  consent: z.boolean(),
});

/** An applicant applies on the career site; the emails go out once the answer is sent. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return careersRoute(
    req,
    async (site, b) => {
      const { id: applicationId, notify } = await submitApplication(site, id, b);
      after(notify);
      return { ok: true, id: applicationId };
    },
    { schema: Body, write: true },
  );
}
