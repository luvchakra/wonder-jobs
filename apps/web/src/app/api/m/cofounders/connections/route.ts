import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { connect, myConnections } from "@/server/cofounders/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The person's connections: with people, and with teams they are on or are asking to join. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ connections: await myConnections(s) }));
}

const Body = z.object({ listingId: z.string().regex(/^cf[pt]_[a-z0-9]{8,40}$/), confirmed: z.boolean().optional() });

/** Show interest in a person, or ask to join a team: the person's own press (cofounders.connect / .join, checked on the server), audited. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => connect(s, b.listingId, b.confirmed), { schema: Body, write: true });
}
