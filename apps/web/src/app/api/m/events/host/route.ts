import { hiringRoute } from "@/server/hiringRoute";
import { eventHost } from "@/server/events/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who hosts an open WonderWorks event, for the signed-in viewer: the host's public network id and name, or null. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("listing") ?? "";
  if (!/^lst_[a-z0-9]{8,40}$/.test(id)) return Response.json({ error: "Which event?" }, { status: 400 });
  return hiringRoute(req, async (s) => ({ host: await eventHost(s, id) }));
}
