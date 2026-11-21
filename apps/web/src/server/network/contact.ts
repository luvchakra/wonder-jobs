/**
 * Phone and email between two connections, through the shared contact exchange (server/contact/exchange.ts): only on
 * a live, unblocked connection the caller is on (`stand`), only on their own press (`network.share_contact`, audited
 * without the details), and the other person is told without them.
 */
import type { ContactOffer, ContactView } from "@/domain/contact/contact";
import type { Session } from "../auth";
import { contactView, offerContact, withdrawContact } from "../contact/exchange";
import { NETWORK, audit, gate, other, tell } from "./network";
import { stand } from "./social";

export async function threadContact(s: Session, connectionId: string): Promise<ContactView> {
  const { c } = await stand(s, connectionId);
  return contactView(NETWORK, c.id, s.tenantId, other(c, s.tenantId));
}

export async function shareThreadContact(s: Session, connectionId: string, offer: ContactOffer, confirmed?: boolean): Promise<ContactView> {
  const { c } = await stand(s, connectionId);
  await gate(s.tenantId, "network.share_contact", confirmed, "Sharing contact details");
  const them = other(c, s.tenantId);
  const view = await offerContact(NETWORK, c.id, s.tenantId, them, offer);
  await audit(s.tenantId, "network.share_contact", c.id, "CONTACT_SHARED");
  await tell(them, view.theirs ? "A connection shared their contact details with you" : "A connection offered to exchange contact details", `/app/network/messages/${c.id}`);
  return view;
}

export async function stopThreadContact(s: Session, connectionId: string): Promise<void> {
  const { c } = await stand(s, connectionId);
  await withdrawContact(NETWORK, c.id, s.tenantId);
  await audit(s.tenantId, "network.share_contact", c.id, "CONTACT_WITHDRAWN");
}
