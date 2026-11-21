/**
 * Buy, Sell & Rent and the person's own data rights: what "Download my data" includes, and what "Delete my account"
 * removes. This module's tables (migration 0042) have no foreign key to the tenant row, so deleting the account doesn't
 * cascade to them: this does (server/privacy/accountData.ts runs it).
 *
 * Only this module's rows: the shared block and report tables are touched only where `module` is "marketplace".
 */
import { blocks, reports } from "../modules/safety";
import { MARKETPLACE } from "@/modules/marketplace/domain";
import { listings, messages, photos, threads, type ThreadRow } from "./store";

const LIMIT = 10_000;

/** Every conversation the person is on, as buyer or seller. */
const mineThreads = async (tenantId: string): Promise<ThreadRow[]> => {
  const [a, b] = await Promise.all([threads().find({ buyer_tenant: tenantId }, { limit: LIMIT }), threads().find({ seller_tenant: tenantId }, { limit: LIMIT })]);
  return [...new Map([...a, ...b].map((t) => [t.id, t])).values()];
};

/**
 * The person's own Buy, Sell & Rent data: their listings (their words and terms; photos as a count), the conversations
 * they are on (the item, their side, where it stands, what they sent, and the offers they made as a buyer), and how many
 * people they blocked. Never the other person's account id, name, contact details or words.
 */
export async function exportMarketplace(tenantId: string): Promise<unknown> {
  const [mine, convos, sent, blocked] = await Promise.all([
    listings().find({ seller_tenant: tenantId }, { order: "created_at", limit: LIMIT }),
    mineThreads(tenantId),
    messages().find({ sender_tenant: tenantId }, { order: "created_at", limit: LIMIT }),
    blocks().find({ module: MARKETPLACE, blocker_tenant: tenantId }, { limit: LIMIT }),
  ]);
  const photoCounts = new Map<string, number>();
  for (const p of await photos().find({ seller_tenant: tenantId }, { limit: LIMIT })) photoCounts.set(p.listing_id, (photoCounts.get(p.listing_id) ?? 0) + 1);
  const titles = new Map((await listings().findIn("id", [...new Set(convos.map((t) => t.listing_id))])).map((l) => [l.id, l.title]));
  return {
    listings: mine.map((l) => ({ id: l.id, title: l.title, description: l.description, area: l.area, terms: l.attrs, state: l.state, photos: photoCounts.get(l.id) ?? 0, createdAt: l.created_at, updatedAt: l.updated_at })),
    conversations: convos.map((t) => {
      const buyer = t.buyer_tenant === tenantId;
      const shared = t.shared.find((x) => x.tenant === tenantId);
      return {
        id: t.id,
        item: titles.get(t.listing_id) ?? null,
        side: buyer ? "buyer" : "seller",
        status: t.status,
        // As the buyer the offers are yours; as the seller they are the buyer's, so they stay out.
        ...(buyer ? { offers: t.offers.map((o) => ({ amount: o.amount, status: o.status, at: o.at })) } : {}),
        ...(shared ? { youSharedEmail: shared.email, sharedAt: shared.at } : {}),
        startedAt: t.created_at,
        updatedAt: t.updated_at,
      };
    }),
    messagesYouSent: sent.map((m) => ({ conversation: m.thread_id, body: m.body, at: m.created_at })),
    peopleYouBlocked: blocked.length,
  };
}

/**
 * Remove the person's Buy, Sell & Rent data for good: their listings with photos and every conversation on them, every
 * conversation they are on as a buyer (the other person loses it too), and the blocks and reports that name them. Safe to
 * run again, and a person with none of it is a no-op.
 */
export async function eraseMarketplace(tenantId: string): Promise<void> {
  const mine = await listings().find({ seller_tenant: tenantId }, { limit: LIMIT });
  const onMine = mine.length ? await threads().findIn("listing_id", mine.map((l) => l.id), undefined, { limit: LIMIT }) : [];
  const convos = [...new Map([...(await mineThreads(tenantId)), ...onMine].map((t) => [t.id, t])).values()];
  const reported = new Set<string>();
  for (const t of convos) {
    for (const m of await messages().find({ thread_id: t.id }, { limit: LIMIT })) reported.add(m.id);
    reported.add(t.id);
    await messages().remove({ thread_id: t.id });
    await threads().remove({ id: t.id });
  }
  await messages().remove({ sender_tenant: tenantId });
  for (const l of mine) {
    reported.add(l.id);
    await photos().remove({ listing_id: l.id });
    await listings().remove({ id: l.id });
  }
  await blocks().remove({ module: MARKETPLACE, blocker_tenant: tenantId });
  await blocks().remove({ module: MARKETPLACE, blocked_tenant: tenantId });
  await reports().remove({ module: MARKETPLACE, reporter_tenant: tenantId });
  await reports().remove({ module: MARKETPLACE, subject_tenant: tenantId });
  // Reports other people filed about what is now gone.
  for (const id of reported) await reports().remove({ module: MARKETPLACE, subject_id: id });
}
