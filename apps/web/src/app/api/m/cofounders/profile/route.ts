import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myProfile, saveProfile, setOpen } from "@/server/cofounders/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The person's own profile, in full (nobody else's). */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ profile: await myProfile(s) }));
}

/** Save the profile; its fields are checked in modules/cofounders/domain.ts::cleanProfile. */
export async function PUT(req: Request) {
  return hiringRoute(req, async (s, b) => ({ profile: await saveProfile(s, b) }), { schema: z.record(z.string(), z.unknown()), write: true });
}

/** Open or close the listing without touching the rest. */
export async function PATCH(req: Request) {
  return hiringRoute(req, async (s, b) => (await setOpen(s, b.open), { ok: true }), { schema: z.object({ open: z.boolean() }), write: true });
}
