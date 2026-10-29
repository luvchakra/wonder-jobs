import { hiringRoute } from "@/server/hiringRoute";
import { myTeachingApplications } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The teacher's own applications and demo classes (their Pipeline). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ applications: await myTeachingApplications(s) }));
}
