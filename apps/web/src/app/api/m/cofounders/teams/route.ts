import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { createTeam, myTeams } from "@/server/cofounders/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The teams the person is on, with their team-mates. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ teams: await myTeams(s) }));
}

/** Start a team: the person becomes its first founder. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => createTeam(s, b), { schema: z.record(z.string(), z.unknown()), write: true });
}
