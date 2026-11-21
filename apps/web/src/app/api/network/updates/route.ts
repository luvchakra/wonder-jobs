import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { deleteUpdate, feedFor, publishPost, reportUpdate, shareListing } from "@/server/network/social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's feed: what their connections posted and did, their own, and posts addressed to everyone on the network. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ updates: await feedFor(s) }));
}

const Body = z.union([
  // Share a listing's public page.
  z.object({ page: z.string().max(260), title: z.string().min(1).max(300) }),
  // Post the caller's own words (network.post, checked on the server), audited without the words.
  z.object({ text: z.string().min(1).max(4000), audience: z.enum(["connections", "everyone"]).optional(), about: z.object({ page: z.string().max(260), title: z.string().max(300) }).optional(), module: z.string().max(30).optional(), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("report"), id: z.string().max(60), reason: z.string().min(3).max(500) }),
]);

/** Share a listing, post, or report someone's post. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      if ("action" in b) return reportUpdate(s, b.id, b.reason);
      if ("page" in b) return shareListing(s, b);
      return publishPost(s, { text: b.text, audience: b.audience, about: b.about, module: b.module }, b.confirmed);
    },
    { schema: Body, write: true },
  );
}

/** ?id=: remove one of the caller's own posts or updates. */
export async function DELETE(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").slice(0, 60);
  return hiringRoute(req, (s) => deleteUpdate(s, id), { write: true });
}
