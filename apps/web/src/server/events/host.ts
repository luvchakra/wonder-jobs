import type { Session } from "../auth";
import { listings } from "../modules/responses";
import { networkIdFor } from "../network/links";
import { viewMember } from "../network/network";
import { EVENTS } from "@/modules/events/domain";
import { showsHost } from "./listings";

export interface EventHost {
  /** The member's public network id: the only identifier that leaves the server. */
  id: string;
  /** Their name as this viewer may see it on the network (full name, or first name and initial, by their own tier). */
  name: string;
}

/**
 * Who hosts an open WonderWorks event, for this viewer (WonderWorks Network, owner 2026-11-21): the member who posted it,
 * and only when that member turned on "Show me as the host" for it (off by default, theirs alone to change: the page
 * otherwise names only the organisation, and `created_by` may be an employee of it). Only an open event counts. The
 * name and the id come from the network as this viewer may see them: nothing at all when either person isn't on the
 * network, one blocked the other, or the host isn't findable by this viewer, never a bare name from the account. Only
 * the public network id and that name leave here, never the host's account id or email; outside-source events have no
 * member behind them and never reach this.
 */
export async function eventHost(s: Session, listingId: string): Promise<EventHost | null> {
  const row = await listings().one({ id: listingId, module: EVENTS, status: "open" });
  if (!row?.created_by || !showsHost(row)) return null;
  const id = await networkIdFor(s.tenantId, row.created_by);
  if (!id) return null;
  try {
    const view = await viewMember(s, id);
    return view.name ? { id, name: view.name } : null;
  } catch {
    return null;
  }
}
