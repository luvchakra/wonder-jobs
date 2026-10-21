import { after } from "next/server";
import { z } from "zod";
import { hostedCareersRoute } from "@/server/hostedCareersRoute";
import { HiringError } from "@/server/hiring";
import { applicationStatus, withdrawApplication } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

const Body = z.object({ token: z.string().min(1).max(200), action: z.literal("withdraw") });

/** The applicant withdraws from the status page of a hosted careers page. */
export async function POST(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  return hostedCareersRoute(
    req,
    slug,
    async (site, b) => {
      const { notify } = await withdrawApplication(site, b.token);
      after(notify);
      const status = await applicationStatus(site, b.token);
      if (!status) throw new HiringError("Application not found.", 404);
      return { application: status };
    },
    { schema: Body, perHour: 30 },
  );
}
