import type { Session } from "../auth";
import { listings } from "../modules/responses";
import { networkIdFor } from "../network/links";
import { SERVICES } from "@/modules/services/domain";

/**
 * The network profile id of the member who posted an open WonderWorks service listing, for this viewer (WonderWorks
 * Network, owner 2026-11-20): the page already names the pro's business, and the pro behind it is the member who posted
 * it. Only an open listing counts, and only the public network id leaves here: never the poster's account id. The
 * network helper itself returns nothing when either person isn't on the network, one blocked the other, or the poster
 * isn't findable by this viewer; outside-source and open-data listings have no member behind them and never reach this.
 */
export async function servicePosterNetworkId(s: Session, listingId: string): Promise<string | null> {
  const row = await listings().one({ id: listingId, module: SERVICES, status: "open" });
  if (!row?.created_by) return null;
  return networkIdFor(s.tenantId, row.created_by);
}
