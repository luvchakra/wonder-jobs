import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { publish, saveListing, setListingState } from "@/server/marketplace/listings";
import { blockSeller, reportListing } from "@/server/marketplace/safety";
import { Listing } from "@/server/marketplace/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), listing: Listing }),
  z.object({ action: z.literal("publish"), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("state"), state: z.enum(["draft", "closed", "sold"]) }),
  z.object({ action: z.literal("report"), reason: z.string().max(500) }),
  z.object({ action: z.literal("block") }),
]);

/** The seller edits, publishes (their own press, gated and audited) or closes a listing; anyone else can only report it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "edit") return saveListing(s, b.listing, id);
      if (b.action === "publish") return void (await publish(s, id, b.confirmed));
      if (b.action === "state") return void (await setListingState(s, id, b.state));
      if (b.action === "block") return void (await blockSeller(s, id));
      return reportListing(s, id, b.reason);
    },
    { schema: Body, write: true },
  );
}
