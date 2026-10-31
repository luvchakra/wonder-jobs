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

/** A line or fact that may be missing: `a && b` leaves false, 0, "" or undefined behind, and they are left out. */
export type Maybe = string | null | undefined | false | 0;

/** What a module says about a listing it shares: everything the listing shows, as it reads at the moment of sharing. */
export interface ListingShareInput {
  /** What the thing is called in the message: "internship", "event", "practitioner"… */
  noun: string;
  title: string;
  /** Its headline facts, one string each ("Pune", "₹10,000 a month"); the ones missing are left out. */
  facts?: Maybe[];
  /** Labelled details, one line each ("Skills: React, SQL", "Apply by: 30 Nov 2026"); the ones missing are left out. */
  lines?: Maybe[];
  /** The listing's own description, as it reads now; cut at a word when long. */
  details?: string;
  /**
   * Where the link goes: the listing's public page on WonderWorks (`/s/<module>/<id>`), whose preview card shows the
   * listing; or the module's own page where a listing has no public page (people's profiles).
   */
  url: string;
}

/** A listing's public page on WonderWorks: its preview card shows the listing, and no account is needed to read it. */
export const publicPath = (module: string, id: string) => `/s/${encodeURIComponent(module)}/${encodeURIComponent(id)}`;

const PITCH = "Found with WonderWorks.";

/** The link as an absolute URL on `origin` when it's a path on this site. */
export function absoluteUrl(origin: string, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${origin.replace(/\/+$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** The description cut at a word to `max` characters, ending "…" when it was cut; whitespace folded to single lines. */
export function excerpt(text: string | undefined, max = 600): string {
  const t = (text ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`;
}

const present = (list: Maybe[] | undefined) => (list ?? []).filter((x): x is string => !!x);

const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * A description without what it only repeats: sentences that say the title again, or one already said. A listing whose
 * description is its title ("Counselling for work related stress." twice) reads as the one line, not a stutter; one that
 * says nothing more than its title leaves nothing.
 */
export function distinctText(title: string, text: string | undefined): string {
  const seen = new Set([plain(title)]);
  const out: string[] = [];
  for (const para of (text ?? "").split(/\n{2,}/)) {
    const kept = para
      .split(/(?<=[.!?])\s+|\n/)
      .map((s) => s.trim())
      .filter((s) => {
        const k = plain(s);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (kept.length) out.push(kept.join(" "));
  }
  return out.join("\n\n");
}

export function listingShareMessage(input: ListingShareInput, url: string): ShareMessage {
  const facts = present(input.facts).join(" · ");
  const lines = present(input.lines);
  const about = excerpt(distinctText(input.title, input.details));
  const head = input.title;
  const body = [...(facts ? [facts] : []), ...(lines.length ? ["", ...lines] : []), ...(about ? ["", about] : [])];
  return {
    subject: `${input.noun[0].toUpperCase()}${input.noun.slice(1)} you might like: ${head}`,
    body: ["Hi,", "", `I came across this ${input.noun} and thought of you:`, "", head, ...body, "", `Take a look: ${url}`, "", "—", PITCH].join("\n"),
    whatsapp: [`*${head}*`, ...body, "", `Thought of you for this one. ${PITCH}`, "", url].join("\n"),
    text: [head, ...body, "", PITCH].join("\n"),
  };
}
