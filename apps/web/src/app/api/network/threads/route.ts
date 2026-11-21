import { hiringRoute } from "@/server/hiringRoute";
import { myThreads } from "@/server/network/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's conversations with their connections, newest first. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ threads: await myThreads(s) }));
}
