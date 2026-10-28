import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { easyApplyForm } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ listingIds: z.array(z.string().max(120)).min(1).max(20) });

/** What Easy Apply needs before it sends: the job's screening questions, and whether this account already applied. Reads only. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => easyApplyForm(s, b.listingIds), { schema: Body });
}
