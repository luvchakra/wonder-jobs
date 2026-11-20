import { hiringRoute } from "@/server/hiringRoute";
import { people } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=name, skill or role: members who match. Without q: people the caller may know, each with the reason. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  return hiringRoute(req, (s) => people(s, q));
}
