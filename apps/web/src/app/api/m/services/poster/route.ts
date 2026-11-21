import { hiringRoute } from "@/server/hiringRoute";
import { servicePosterNetworkId } from "@/server/services/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in viewer's link to the network profile of the member who posted a pro's listing: just the public id, or null. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("listing") ?? "";
  if (!/^lst_[a-z0-9]{8,40}$/.test(id)) return Response.json({ error: "Which listing?" }, { status: 400 });
  return hiringRoute(req, async (s) => ({ networkId: await servicePosterNetworkId(s, id) }));
}
