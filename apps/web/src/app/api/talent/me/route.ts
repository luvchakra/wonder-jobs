import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myTalentProfile, removeMyTalentProfile, saveMyTalentProfile } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the caller shows recruiters, or null when they aren't open to recruiters. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ profile: await myTalentProfile(s) }));
}

const Profile = z.object({
  displayName: z.string().max(60),
  headline: z.string().max(160),
  seniority: z.string().max(20),
  yearsExperience: z.number().min(0).max(60),
  skills: z.array(z.string().max(60)).max(30),
  locations: z.array(z.string().max(80)).max(10),
  workModes: z.array(z.string().max(10)).max(3),
  summary: z.string().max(600),
});

/** Turn on (or update) being open to recruiters, with exactly these fields. */
export async function PUT(req: Request) {
  return hiringRoute(req, async (s, b) => ({ profile: await saveMyTalentProfile(s, b) }), { schema: Profile, write: true });
}

/** Turn it off: the profile is deleted. */
export async function DELETE(req: Request) {
  return hiringRoute(req, (s) => removeMyTalentProfile(s), { write: true });
}
