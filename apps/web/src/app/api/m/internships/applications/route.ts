import { hiringRoute } from "@/server/hiringRoute";
import { myInternshipApplications } from "@/server/internships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The student's own internship applications (their Pipeline). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ applications: await myInternshipApplications(s) }));
}
