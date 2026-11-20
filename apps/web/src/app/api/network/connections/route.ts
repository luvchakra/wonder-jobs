import { hiringRoute } from "@/server/hiringRoute";
import { myNetwork } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's connections, the requests waiting for them, and the ones they sent. */
export async function GET(req: Request) {
  return hiringRoute(req, (s) => myNetwork(s));
}
