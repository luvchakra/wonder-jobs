import { hiringRoute } from "@/server/hiringRoute";
import { myScholarshipApplications } from "@/server/scholarships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The student's own scholarship and project applications (their Applications tab). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ applications: await myScholarshipApplications(s) }));
}
