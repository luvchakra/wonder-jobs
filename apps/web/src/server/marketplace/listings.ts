/**
 * Buy, Sell & Rent listings: an individual seller's items in `marketplace_listings`, apart from every other module's rows.
 * Publishing is the seller's own press, gated by `resolveCapability` (marketplace.publish; a failed lookup asks) and audited
 * once per listing. The prohibited-items list and the no-contact-details rule run here on the server both when a listing is
 * saved and when it is published; a new account is rate-limited. The one cross-tenant read is open listings (public), minus
 * anyone the viewer blocked or who blocked them, minus listings reported by three people.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { recordServerAudit } from "../audit";
import { hiddenFrom } from "../modules/safety";
import { newId } from "@/lib/ids";
import { cleanListing, LIMITS, MARKETPLACE, readTerms, withinLimit, type ListingInput, type ListingState, type MarketListing } from "@/modules/marketplace/domain";
import { gate, gone, listings, now, photos, type ListingRow } from "./store";
import { WONDERWORKS_MARKETPLACE } from "./sources";

const firstName = (n: string) => n.trim().split(/\s+/)[0]?.slice(0, 40) || "A seller";

export const toListing = (r: ListingRow): MarketListing => ({ id: `mk_${r.id}`, listingId: r.id, title: r.title, description: r.description, area: r.area, terms: readTerms(r.attrs), sellerVerified: r.seller_verified, seller: firstName(r.seller_name), postedAt: r.updated_at, sourceId: WONDERWORKS_MARKETPLACE, sourceName: "WonderWorks listings" });

/** The caller's own listings, newest first (every state). */
export async function myListings(s: Session): Promise<(MarketListing & { state: ListingState })[]> {
  return (await listings().find({ seller_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 200 })).map((r) => ({ ...toListing(r), state: r.state }));
}

/** Every open listing the viewer may see (public postings), newest first. */
export async function openMarketListings(viewer: string | null, limit = 300): Promise<ListingRow[]> {
  const [rows, hidden] = await Promise.all([listings().find({ state: "open" }, { order: "updated_at", desc: true, limit }), viewer ? hiddenFrom(MARKETPLACE, viewer) : Promise.resolve(new Set<string>())]);
  return rows.filter((r) => !hidden.has(r.seller_tenant) && r.seller_tenant !== viewer);
}

/** One open listing for a viewer, or null when it's gone, hidden or from someone who blocked them. */
export async function openListing(viewer: string, id: string): Promise<ListingRow | null> {
  const r = await listings().one({ id, state: "open" });
  if (!r || (await hiddenFrom(MARKETPLACE, viewer)).has(r.seller_tenant)) return null;
  return r;
}

/** Save a draft, or edit one of the caller's own listings. Creating is rate-limited (3 a day). */
export async function saveListing(s: Session, input: ListingInput, id?: string): Promise<MarketListing & { state: ListingState }> {
  const c = cleanListing(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const at = now();
  if (id) {
    const old = await listings().one({ id, seller_tenant: s.tenantId });
    if (!old) throw gone();
    if (old.state === "hidden" || old.state === "sold") throw new HiringError("This listing can't be edited now.", 409);
    await listings().update({ id, seller_tenant: s.tenantId }, { title: c.value.title, description: c.value.description, area: c.value.area, attrs: { ...c.value.terms, photos: readTerms(old.attrs).photos }, updated_at: at });
    const r = (await listings().one({ id, seller_tenant: s.tenantId }))!;
    return { ...toListing(r), state: r.state };
  }
  const mine = await listings().find({ seller_tenant: s.tenantId }, { order: "created_at", desc: true, limit: 50 });
  if (!withinLimit(mine.map((m) => m.created_at), LIMITS.listingsPerDay, 86_400_000)) throw new HiringError(`You can add ${LIMITS.listingsPerDay} listings a day. Try again tomorrow.`, 429);
  const row: ListingRow = { id: newId("lst"), seller_tenant: s.tenantId, seller_name: (s.name ?? "").slice(0, 80), seller_verified: !!s.email, title: c.value.title, description: c.value.description, area: c.value.area, attrs: { ...c.value.terms, photos: [] }, state: "draft", created_at: at, updated_at: at };
  await listings().insert(row);
  return { ...toListing(row), state: "draft" };
}

/** Put a draft in Find (the seller's own press; a verified sign-in email and at least one photo are required). */
export async function publish(s: Session, id: string, confirmed?: boolean): Promise<void> {
  const r = await listings().one({ id, seller_tenant: s.tenantId });
  if (!r) throw gone();
  if (r.state === "open") return;
  if (r.state !== "draft" && r.state !== "closed") throw new HiringError("This listing can't be published.", 409);
  if (!s.email) throw new HiringError("Sign in with your email to publish. Buyers need to know a real person is selling.", 403);
  const c = cleanListing({ title: r.title, description: r.description, area: r.area, ...readTerms(r.attrs) });
  if ("problem" in c) throw new HiringError(c.problem);
  if (!(await photos().find({ listing_id: id, seller_tenant: s.tenantId, position: 0 })).length && !readTerms(r.attrs).photos.length) throw new HiringError("Add at least one photo of the item.");
  await gate(s.tenantId, "marketplace.publish", confirmed, "Publishing");
  await listings().update({ id, seller_tenant: s.tenantId }, { state: "open", seller_verified: true, seller_name: r.seller_name || (s.name ?? "").slice(0, 80), updated_at: now() });
  await recordServerAudit(s.tenantId, { actionId: `marketplace.publish:${id}`, actionType: "marketplace.publish", event: "LISTING_PUBLISHED", detail: id });
}

/** Take a listing off Find (closed), return it to draft, or mark it sold. A hidden listing stays hidden. */
export async function setListingState(s: Session, id: string, state: "draft" | "closed" | "sold"): Promise<void> {
  const r = await listings().one({ id, seller_tenant: s.tenantId });
  if (!r) throw gone();
  if (r.state === "hidden") throw new HiringError("This listing was hidden after reports and can't be changed.", 409);
  await listings().update({ id, seller_tenant: s.tenantId }, { state, updated_at: now() });
}
