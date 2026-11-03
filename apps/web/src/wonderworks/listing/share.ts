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
  /** An X post: short, the link added by X itself, hashtags last. */
  x: string;
  /** Instagram and Facebook: the caption to paste under the image, ending with the link and hashtags. */
  caption: string;
}

export const emailHref = (m: ShareMessage) => `mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
export const whatsappHref = (m: ShareMessage) => `https://wa.me/?text=${encodeURIComponent(m.whatsapp)}`;
export const xHref = (m: ShareMessage, url: string) => `https://x.com/intent/post?text=${encodeURIComponent(m.x)}&url=${encodeURIComponent(url)}`;
/** Facebook takes only the link; its preview card (the listing's image) is the post. */
export const facebookHref = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

/** An X post's text, cut so the post with its link (counted as 23) stays under 280. */
export function xPost(head: string, facts: string, end: string): string {
  const room = 280 - 24 - end.length - 2;
  const lead = [head, facts].filter(Boolean).join("\n");
  return `${lead.length > room ? `${lead.slice(0, room - 1).trimEnd()}…` : lead}\n\n${end}`;
}

/** A hashtag from a word or two: "internship" → "#Internship". */
export const hashtag = (s: string) => `#${s.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1)).join("")}`;

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
  /** A public photo of the listing (our image-proxy path), shown large on its share image; none for most listings. */
  image?: string;
}

/** Bumped when the share image's design changes, so phones and the CDN fetch the new one instead of a cached copy. */
export const STORY_VERSION = 8;
/** A listing's or job's share image (`<public page>/story`). */
export const storyPath = (page: string) => `${page}/story?v=${STORY_VERSION}`;

/** A listing's public page on WonderWorks: its preview card shows the listing, and no account is needed to read it. */
export const publicPath = (module: string, id: string) => `/s/${encodeURIComponent(module)}/${encodeURIComponent(id)}`;

const PITCH = "Found with WonderWorks.";
/** The closing marketing line on every shared listing's image, caption and post. */
export const LISTING_HINT = "Find yours free on WonderWorks";

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

/**
 * A listing's share summary (owner, 2026-11-03: "use ai to summarise … keep it useful and crisp"): `hook`, one sentence
 * on why it's worth a look, goes in the message; `highlights`, a few concrete details, go on the share image (or in the
 * message where there is no image). `ai` says the model wrote them (kept for logs and tests); both are labelled just "Summary" (owner, 2026-11-03).
 */
export interface ShareSummary {
  hook: string;
  highlights: string[];
  ai: boolean;
}

/** The description's first sentence that says more than the title, cut to `max`: the summary without a model. */
export function firstSentence(title: string, details: string | undefined, max = 140): string {
  const text = distinctText(title, (details ?? "").replace(/<[^>]+>/g, " "));
  const name = plain(title);
  // Not a sentence that only restates the title ("Maths Teacher Wanted."), nor one with a link.
  const says = (x: string) => x.trim().length > 20 && !/https?:\/\/|www\./i.test(x) && !(plain(x).includes(name) && plain(x).length < name.length + 16);
  const fold = (x: string) => x.replace(/\s+/g, " ").trim();
  const candidates = text.split(/(?<=[.!?])\s+/).filter(says).map(fold);
  // A whole sentence that fits, when one of the first few does; otherwise the first, cut at a word.
  const whole = candidates.slice(0, 4).find((x) => x.length <= max);
  if (whole) return whole;
  const t = candidates[0] ?? "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Sections joined with one blank line between them, empty ones left out (so a missing hook leaves no gap). */
export const sections = (...parts: (string | string[] | false | null | undefined)[]) =>
  parts
    .map((p) => (Array.isArray(p) ? p.filter(Boolean).join("\n") : p || ""))
    .filter(Boolean)
    .join("\n\n");

/**
 * The crisp message, the same shape in every module: the title, its headline facts, the one-line hook and the link, then
 * WonderWorks' line. The details go on the share image, so the message doesn't repeat them; where a listing has no
 * image (people's profiles), the highlights come in the message instead.
 */
export function listingShareMessage(input: ListingShareInput, url: string, opts: { summary?: ShareSummary | null; image?: boolean } = {}): ShareMessage {
  const facts = present(input.facts).join(" · ");
  const head = input.title;
  const hook = opts.summary?.hook || firstSentence(input.title, input.details);
  const points = (opts.summary?.highlights.length ? opts.summary.highlights : present(input.lines).filter((l) => !/^(from|source):/i.test(l)).slice(0, 3)).map((h) => `• ${h}`);
  const inline = opts.image ? [] : points;
  return {
    subject: `${input.noun[0].toUpperCase()}${input.noun.slice(1)} you might like: ${head}`,
    body: sections(["Hi,"], `I came across this ${input.noun} and thought of you:`, [head, facts], hook, points, `Take a look: ${url}`, ["—", PITCH]),
    whatsapp: sections([`*${head}*`, facts], hook, inline, `Thought of you for this one. ${PITCH}`, url),
    text: sections([head, facts], hook, inline, PITCH),
    x: xPost(head, [facts, hook].filter(Boolean).join("\n"), `${LISTING_HINT} ${hashtag(input.noun)} #WonderWorks`),
    caption: sections([head, facts], hook, `See it: ${url}`, [`${LISTING_HINT}.`, `${hashtag(input.noun)} #WonderWorks`]),
  };
}
