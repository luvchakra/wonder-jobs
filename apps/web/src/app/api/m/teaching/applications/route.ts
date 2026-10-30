import { hiringRoute } from "@/server/hiringRoute";
import { myApplications } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The teacher's own teaching applications (their Pipeline). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ applications: await myApplications(s) }));
}
