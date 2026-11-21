/**
 * WonderWorks Network and the member's own data rights: what "Download my data" includes, and what "Delete my account"
 * removes. The network tables aren't keyed to the tenant row, so deleting the account doesn't cascade to them: this does.
 */
import { blocks, reports } from "../modules/safety";
import { NETWORK, comments, conns, dropUpdates, profiles, reactions, toProfile, updates } from "./network";
import { msgs } from "./social";

const mine = async (tenantId: string) => {
  const [a, b] = await Promise.all([conns().find({ requester: tenantId }, { limit: 5000 }), conns().find({ recipient: tenantId }, { limit: 5000 })]);
  return [...a, ...b];
};

/** The member's own network data: their profile, their connections (without the other person's details), what they wrote and shared. */
export async function exportNetwork(tenantId: string): Promise<unknown> {
  const [p, links, sent, shared, said, felt] = await Promise.all([
    profiles().one({ tenant_id: tenantId }),
    mine(tenantId),
    msgs().find({ sender_tenant: tenantId }, { order: "created_at", limit: 10_000 }),
    updates().find({ tenant_id: tenantId }, { order: "created_at", limit: 1000 }),
    comments().find({ tenant_id: tenantId }, { order: "created_at", limit: 10_000 }),
    reactions().find({ tenant_id: tenantId }, { limit: 10_000 }),
  ]);
  return {
    profile: p ? toProfile(p) : null,
    connections: links.map((c) => ({ id: c.id, direction: c.requester === tenantId ? "you asked" : "they asked", status: c.status, how: c.requester === tenantId ? c.how : undefined, note: c.requester === tenantId ? c.note : undefined, at: c.created_at, updatedAt: c.updated_at })),
    messagesYouSent: sent.map((m) => ({ connection: m.connection_id, body: m.body, at: m.created_at })),
    updates: shared.map((u) => ({ id: u.id, kind: u.kind, module: u.module, text: u.text, href: u.href, ...(u.reshare_of ? { reshareOf: u.reshare_of } : {}), ...(u.media?.length ? { photos: u.media.length } : {}), at: u.created_at })),
    commentsYouWrote: said.map((c) => ({ on: c.update_id, body: c.body, at: c.created_at })),
    reactionsYouGave: felt.map((r) => ({ on: r.update_id, reaction: r.kind, at: r.created_at })),
  };
}

/**
 * Remove the member from the network for good: their profile, updates and photos, reactions and comments (and others' on their posts), every connection and request they are on with
 * its whole conversation (the other person loses that conversation too), and the blocks and reports that name them.
 */
export async function eraseNetwork(tenantId: string): Promise<void> {
  for (const c of await mine(tenantId)) {
    await msgs().remove({ connection_id: c.id });
    await conns().remove({ id: c.id });
  }
  await msgs().remove({ sender_tenant: tenantId });
  // Their posts with the reactions and comments on them, and their own reactions and comments.
  await dropUpdates(tenantId);
  await profiles().remove({ tenant_id: tenantId });
  await blocks().remove({ module: NETWORK, blocker_tenant: tenantId });
  await blocks().remove({ module: NETWORK, blocked_tenant: tenantId });
  await reports().remove({ module: NETWORK, reporter_tenant: tenantId });
  await reports().remove({ module: NETWORK, subject_tenant: tenantId });
}
