import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { createWorkspace, myWorkspaces } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's hiring workspaces and the invitations waiting for them. */
export async function GET(req: Request) {
  return hiringRoute(req, (s) => myWorkspaces(s));
}

const Create = z.object({ name: z.string().trim().min(2).max(120), website: z.string().trim().max(300).optional() });

/** Create a company's hiring workspace; the caller becomes its owner. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => createWorkspace(s, b), { schema: Create, write: true });
}
