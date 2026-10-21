import { after } from "next/server";
import { z } from "zod";
import { hostedCareersRoute } from "@/server/hostedCareersRoute";
import { HiringError } from "@/server/hiring";
import { submitApplication } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string; id: string }> };

const Body = z.object({
  name: z.string().max(200),
  email: z.string().max(200),
  phone: z.string().max(60).optional(),
  location: z.string().max(200).optional(),
  linkedinUrl: z.string().max(600).optional(),
  resumeUrl: z.string().max(600).optional(),
  coverNote: z.string().max(5000).optional(),
  consent: z.boolean(),
  // Hidden from people; anything typed here is a bot.
  website: z.string().max(200).optional(),
});

/** An applicant applies on a careers page WonderJobs hosts; the emails go out once the answer is sent. */
export async function POST(req: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  return hostedCareersRoute(
    req,
    slug,
    async (site, b) => {
      if (b.website) throw new HiringError("Your application couldn't be sent.");
      const { website: _bot, ...input } = b;
      void _bot;
      const { notify } = await submitApplication(site, id, input);
      after(notify);
      return { ok: true };
    },
    { schema: Body, perHour: 10 },
  );
}
