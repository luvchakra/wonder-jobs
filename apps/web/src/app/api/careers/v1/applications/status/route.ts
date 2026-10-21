import { after } from "next/server";
import { z } from "zod";
import { careersRoute } from "@/server/careersRoute";
import { HiringError } from "@/server/hiring";
import { applicationStatus, withdrawApplication } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The token travels in the body, not the address, so it stays out of request logs.
const Body = z.object({ token: z.string().min(1).max(200), action: z.enum(["view", "withdraw"]).default("view") });

/** The applicant's status page: { token } shows the status; { token, action: "withdraw" } withdraws. */
export async function POST(req: Request) {
  return careersRoute(
    req,
    async (site, b) => {
      if (b.action === "withdraw") {
        const { notify } = await withdrawApplication(site, b.token);
        after(notify);
      }
      const status = await applicationStatus(site, b.token);
      if (!status) throw new HiringError("Application not found.", 404);
      return { application: status };
    },
    { schema: Body, write: true },
  );
}
