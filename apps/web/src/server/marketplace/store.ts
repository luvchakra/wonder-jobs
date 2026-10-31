/**
 * Buy, Sell & Rent's tables and the steps its server code shares: the capability gate read from the person's own saved
 * policy, the bell notice (tagged marketplace so only this module's bell shows it) and the rate-limit reads.
 * Tenant isolation: a listing is changed only by its seller_tenant; a thread is read or changed only by its buyer_tenant or
 * seller_tenant (`stand` in threads.ts). Open listings are the one cross-tenant read.
 */
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { capabilityDecision } from "../modules/responses";
import { deliver, type Notice } from "../notifications/deliver";
import type { Capability } from "@/domain/automation/policy";
import { MARKETPLACE, type ListingState, type Offer, type ThreadStatus } from "@/modules/marketplace/domain";

export type ListingRow = { id: string; seller_tenant: string; seller_name: string; seller_verified: boolean; title: string; description: string; area: string; attrs: Record<string, unknown>; state: ListingState; created_at: string; updated_at: string };
export type PhotoRow = { id: string; listing_id: string; seller_tenant: string; position: number; mime: string; ciphertext: string; created_at: string };
export type Shared = { tenant: string; email: string; at: string };
export type Mark = { tenant: string; at: string };
export type ThreadRow = { id: string; listing_id: string; buyer_tenant: string; seller_tenant: string; buyer_name: string; status: ThreadStatus; offers: Offer[]; done_marks: Mark[]; shared: Shared[]; end_reason: string | null; created_at: string; updated_at: string };
export type MessageRow = { id: string; thread_id: string; sender_tenant: string; body: string; risky: boolean; created_at: string };

export const listings = () => table<ListingRow>("marketplace_listings");
export const photos = () => table<PhotoRow>("marketplace_photos");
export const threads = () => table<ThreadRow>("marketplace_threads");
export const messages = () => table<MessageRow>("marketplace_messages");
export const now = () => new Date().toISOString();

/**
 * `resolveCapability(capability)` for this person from their saved policy (a failed or missing lookup fails closed to
 * asking). Off: 403. Ask me and the person hasn't yet seen what goes: 409, and the screen shows its review step.
 */
export async function gate(tenant: string, capability: Capability, confirmed: boolean | undefined, what: string): Promise<void> {
  const d = await capabilityDecision(tenant, capability);
  if (d === "skip") throw new HiringError(`${what} is turned off in Buy, Sell & Rent → You.`, 403);
  if (d === "ask" && !confirmed) throw new HiringError("Check what goes, then press Send.", 409);
}

/** Discreet: a lock screen may show it, so it names no item and no one. */
export async function tell(tenant: string, title: string, href = "/app/m/marketplace/pipeline"): Promise<void> {
  const n: Notice = { category: "application_status", module: MARKETPLACE, title, body: "Open WonderWorks to see it.", href, action: "Open" };
  try {
    await deliver(tenant, n);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

export const gone = () => new HiringError("This listing isn't available.", 404);
