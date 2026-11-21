/**
 * WonderWorks Network, for the modules: where a module already shows a viewer who a person is (a co-founder at mutual
 * interest, the member who posted a service, an event's host), it may link that person to their network profile.
 *
 * This never reveals anyone the network itself wouldn't: an id comes back only when both people are on the network,
 * neither blocked the other, and the person is findable by everyone or already stands with the viewer (connected, or
 * they asked the viewer to connect). "Only people with your link" and "Connections only" stay hidden from module pages.
 * The module passes account ids it already holds on the server; only the public id ever goes to the browser.
 */
import { mayOpen } from "@/domain/network/network";
import { hiddenFrom } from "../modules/safety";
import { NETWORK, conns, profiles } from "./network";

/** Each person's network profile id, for those this viewer may be linked to. People not in the map have none to show. */
export async function networkIdsFor(viewerTenant: string, personTenants: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(personTenants.filter((t) => t && t !== viewerTenant))].slice(0, 200);
  if (!ids.length) return out;
  try {
    if (!(await profiles().one({ tenant_id: viewerTenant }))) return out;
    const [rows, hidden, asked, askedOf] = await Promise.all([profiles().findIn("tenant_id", ids), hiddenFrom(NETWORK, viewerTenant), conns().find({ requester: viewerTenant }, { limit: 2000 }), conns().find({ recipient: viewerTenant }, { limit: 2000 })]);
    const connected = new Set([...asked, ...askedOf].filter((c) => c.status === "connected").map((c) => (c.requester === viewerTenant ? c.recipient : c.requester)));
    const askedMe = new Set(askedOf.filter((c) => c.status === "pending").map((c) => c.requester));
    for (const r of rows) {
      if (hidden.has(r.tenant_id)) continue;
      const relation = connected.has(r.tenant_id) ? "connected" : askedMe.has(r.tenant_id) ? "pending_in" : "none";
      if (relation === "none" ? r.find_by === "everyone" : mayOpen(r.find_by, relation)) out.set(r.tenant_id, r.public_id);
    }
  } catch {
    // The network isn't available: the module page shows no link, and nothing else changes.
  }
  return out;
}

export async function networkIdFor(viewerTenant: string, personTenant: string): Promise<string | null> {
  return (await networkIdsFor(viewerTenant, [personTenant])).get(personTenant) ?? null;
}
