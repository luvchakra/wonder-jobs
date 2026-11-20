import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { leaveNetwork, myProfile, saveMyProfile } from "@/server/network/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own network profile, or null when they aren't on the network. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ profile: await myProfile(s) }));
}

const tier = z.enum(["everyone", "connections", "hidden"]);
const Profile = z.object({
  name: z.string().max(200),
  headline: z.string().max(400),
  location: z.string().max(200),
  about: z.string().max(4000),
  skills: z.array(z.string().max(120)).max(60),
  experience: z.array(z.object({ title: z.string().max(200), org: z.string().max(200), start: z.string().max(40), end: z.string().max(40).optional(), current: z.boolean().optional(), location: z.string().max(200).optional() })).max(40),
  education: z.array(z.object({ school: z.string().max(200), degree: z.string().max(300).optional(), end: z.string().max(40).optional() })).max(20),
  tiers: z.object({ name: tier, photo: tier, headline: tier, about: tier, experience: tier, education: tier, connections: tier }),
  findBy: z.enum(["everyone", "link", "connections"]),
  requestsFrom: z.enum(["everyone", "second", "nobody"]),
  statuses: z.array(z.string().max(40)).max(8),
  shareUpdates: z.boolean(),
});

/** Join the network, or update what it shows: exactly these fields (the server caps them). */
export async function PUT(req: Request) {
  return hiringRoute(req, async (s, b) => ({ profile: await saveMyProfile(s, b as never) }), { schema: Profile, write: true });
}

/** Leave the network: the profile is removed. */
export async function DELETE(req: Request) {
  return hiringRoute(req, (s) => leaveNetwork(s), { write: true });
}
