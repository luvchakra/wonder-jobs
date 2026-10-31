/**
 * Sharing a listing with someone else, for every WonderWorks module (taken from Jobs' share, owner, 2026-10-19): a
 * message that reads well in WhatsApp and email, built only from the listing's own public details — nothing the person's
 * profile says about it (fit, notes, saved) leaves the account.
 */
export interface ShareMessage {
  subject: string;
  /** Plain-text email body. */
  body: string;
  /** WhatsApp text: the link comes last and alone, so WhatsApp previews it. */
  whatsapp: string;
  /** For the phone's own share sheet. */
  text: string;
}

export const emailHref = (m: ShareMessage) => `mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
export const whatsappHref = (m: ShareMessage) => `https://wa.me/?text=${encodeURIComponent(m.whatsapp)}`;

/** What a module says about a listing it shares. */
export interface ListingShareInput {
  /** What the thing is called in the message: "internship", "event", "practitioner"… */
  noun: string;
  title: string;
  /** Its public facts, one string each ("Pune", "₹10,000 a month"); the ones missing are left out. */
  facts?: (string | null | undefined | false)[];
  /**
   * Where the link goes: the original posting for a listing from an outside source, else the module's own Find. A
   * listing WonderWorks created has no public page of its own, so the person who opens it lands on the module.
   */
  url: string;
}

const PITCH = "Found with WonderWorks.";

/** The link as an absolute URL on `origin` when it's a path on this site. */
export function absoluteUrl(origin: string, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${origin.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function listingShareMessage(input: ListingShareInput, url: string): ShareMessage {
  const facts = (input.facts ?? []).filter((f): f is string => !!f).join(" · ");
  const head = input.title;
  return {
    subject: `${input.noun[0].toUpperCase()}${input.noun.slice(1)} you might like: ${head}`,
    body: ["Hi,", "", `I came across this ${input.noun} and thought of you:`, "", head, ...(facts ? [facts] : []), "", `Take a look: ${url}`, "", "—", PITCH].join("\n"),
    whatsapp: [`*${head}*`, ...(facts ? [facts] : []), "", `Thought of you for this one. ${PITCH}`, "", url].join("\n"),
    text: [head, ...(facts ? [facts] : []), "", PITCH].join("\n"),
  };
}
