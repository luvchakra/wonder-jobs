import { hiringRoute } from "@/server/hiringRoute";
import { myConversations } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's conversations with companies, as a job seeker. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ conversations: await myConversations(s) }));
}
