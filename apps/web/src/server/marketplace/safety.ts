/**
 * Buy, Sell & Rent's report and block actions, on WonderWorks' shared safety layer (server/modules/safety.ts).
 * Every listing and conversation has both. A listing reported by three different people is hidden at once (state 'hidden')
 * and stays hidden until the platform admins review it. Blocking ends the live conversations between the two people and hides
 * each from the other in Find. Nobody is told they were blocked or reported. Each report is audited once.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { recordServerAudit } from "../audit";
import { blockPerson, fileReport, reportCount } from "../modules/safety";
import { cleanReason, MARKETPLACE, REPORTS_TO_HIDE } from "@/modules/marketplace/domain";
import { gone, listings, messages, now, threads } from "./store";
import { standIn } from "./threads";

const audit = (s: Session, kind: string, id: string, event: string) => recordServerAudit(s.tenantId, { actionId: `marketplace.report:${kind}:${id}`, actionType: "marketplace.report", event, detail: id });

/** Report an open listing (anyone signed in but its seller). The third distinct report hides it. */
export async function reportListing(s: Session, listingId: string, reason: unknown): Promise<{ hidden: boolean }> {
  const why = cleanReason(reason);
  if ("problem" in why) throw new HiringError(why.problem);
  const l = await listings().one({ id: listingId });
  if (!l || l.state === "draft" || l.seller_tenant === s.tenantId) throw gone();
  const r = await fileReport(MARKETPLACE, s.tenantId, { kind: "listing", id: l.id, tenant: l.seller_tenant }, why.value);
  if (!r.repeated) await audit(s, "listing", l.id, "LISTING_REPORTED");
  const hidden = l.state === "open" && (await reportCount(MARKETPLACE, "listing", l.id)) >= REPORTS_TO_HIDE;
  if (hidden) await listings().update({ id: l.id, state: "open" }, { state: "hidden", updated_at: now() });
  return { hidden: hidden || l.state === "hidden" };
}

/** Report a conversation, or one message in it, as someone on it. */
export async function reportThread(s: Session, threadId: string, reason: unknown, messageId?: string): Promise<void> {
  const why = cleanReason(reason);
  if ("problem" in why) throw new HiringError(why.problem);
  const { t } = await standIn(s, threadId);
  const them = s.tenantId === t.buyer_tenant ? t.seller_tenant : t.buyer_tenant;
  if (messageId) {
    const m = await messages().one({ id: messageId, thread_id: t.id });
    if (!m || m.sender_tenant === s.tenantId) throw new HiringError("That message isn't in this conversation.", 404);
    const r = await fileReport(MARKETPLACE, s.tenantId, { kind: "message", id: m.id, tenant: m.sender_tenant }, why.value);
    if (!r.repeated) await audit(s, "message", m.id, "MESSAGE_REPORTED");
    return;
  }
  const r = await fileReport(MARKETPLACE, s.tenantId, { kind: "thread", id: t.id, tenant: them }, why.value);
  if (!r.repeated) await audit(s, "thread", t.id, "THREAD_REPORTED");
}

async function blockTenant(s: Session, them: string, detail: string): Promise<void> {
  if (them === s.tenantId) throw new HiringError("You can't block yourself.", 409);
  await blockPerson(MARKETPLACE, s.tenantId, them);
  await recordServerAudit(s.tenantId, { actionId: `marketplace.block:${them}`, actionType: "marketplace.block", event: "PERSON_BLOCKED", detail });
  const all = [...(await threads().find({ buyer_tenant: s.tenantId, seller_tenant: them })), ...(await threads().find({ buyer_tenant: them, seller_tenant: s.tenantId }))];
  for (const x of all) if (["messaged", "offer", "visit"].includes(x.status)) await threads().update({ id: x.id }, { status: "closed", end_reason: "blocked", updated_at: now() });
}

/** Block the other person in a conversation: it ends, and they are hidden from each other everywhere in this module. */
export async function blockInThread(s: Session, threadId: string): Promise<void> {
  const { t } = await standIn(s, threadId);
  await blockTenant(s, s.tenantId === t.buyer_tenant ? t.seller_tenant : t.buyer_tenant, t.id);
}

/** Block a listing's seller from the listing itself (anyone signed in but the seller). */
export async function blockSeller(s: Session, listingId: string): Promise<void> {
  const l = await listings().one({ id: listingId });
  if (!l || l.state === "draft") throw gone();
  await blockTenant(s, l.seller_tenant, listingId);
}
