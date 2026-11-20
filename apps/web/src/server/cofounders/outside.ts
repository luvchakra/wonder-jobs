/**
 * Co-founders' outside listings (owner, 2026-11-05, WJ-612): posts people published for others to read, and startups from
 * public directories. They come from WorksLake's data gateway (Hacker News posts, Y Combinator companies: collected on a
 * schedule, never per search) and from two keyed sources (Reddit, Product Hunt: keyed.ts).
 *
 * Privacy: a post is its title, the first lines of its text (email addresses and phone numbers were removed where the
 * gateway stored it), its date and the author's public handle only, linking to the post. Never a profile, never contact
 * details. A startup is a company, never its founders. Each shows where it was published and links back there.
 */
import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { scrubContacts } from "../../../../data-gateway/src/core.mjs";
import { gatewayListings } from "../gateway/listings";
import { POST_MAX_AGE_DAYS, type CofounderListing, type CofounderTerms, type ListingKind } from "@/modules/cofounders/domain";

export const COF_OUTSIDE = "cof_outside";

/** The gateway sources' names (their attribution) that are posts, and that are startup directories. */
export const POST_SOURCES = new Set(["Hacker News", "Reddit"]);
export const STARTUP_SOURCES = new Set(["Y Combinator", "Product Hunt"]);

const MS_DAY = 86_400_000;
const EXCERPT = 400;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
const https = (u: string) => (/^https:\/\/[^\s]+$/i.test(u) ? u : undefined);

/** The first lines of a post's text: whole words, no link-only text. */
export function excerpt(text: string, max = EXCERPT): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

/** A gateway listing as a Co-founders listing, or null when it isn't a post or startup source's, or is too old or has no link. */
export function fromGateway(l: GatewayListing, now = Date.now()): CofounderListing | null {
  const kind: ListingKind | null = POST_SOURCES.has(l.sourceName) ? "post" : STARTUP_SOURCES.has(l.sourceName) ? "startup" : null;
  const url = https(l.canonicalUrl);
  if (!kind || !url || !l.title) return null;
  const a = l.attributes ?? {};
  if (kind === "post") {
    // Only recent posts, and only with a date: an undated one can't be shown to be recent.
    const at = l.publishedAt ? Date.parse(l.publishedAt) : NaN;
    if (!Number.isFinite(at) || now - at > POST_MAX_AGE_DAYS * MS_DAY || at > now + MS_DAY) return null;
    const handle = str(a.handle).replace(/^\/?u\//, "").slice(0, 40);
    const terms: CofounderTerms = handle ? { handle } : {};
    return { id: l.id, kind, title: scrubContacts(l.title), company: l.sourceName, location: "", terms, description: excerpt(scrubContacts(l.description)), postedAt: l.publishedAt!, url, sourceId: COF_OUTSIDE, sourceName: l.sourceName, shareable: true };
  }
  const batch = str(a.batch) || undefined;
  const teamSize = num(a.teamSize);
  const terms: CofounderTerms = { ...(batch ? { batch } : {}), ...(teamSize ? { teamSize } : {}), ...(typeof a.hiring === "boolean" ? { hiring: a.hiring } : {}) };
  const line = str(a.oneLiner);
  return { id: l.id, kind, title: l.title, company: line || l.sourceName, location: l.location || "", terms, description: excerpt(l.description || line), ...(l.publishedAt ? { postedAt: l.publishedAt } : {}), url, sourceId: COF_OUTSIDE, sourceName: l.sourceName, shareable: true };
}

/**
 * Every post and startup the gateway holds for Co-founders (active sources only, unexpired), up to a bound. `configured`
 * is false where the gateway isn't set up on this deployment, so a search can say "Needs setup" instead of "none".
 */
export async function gatewayOutside(now = Date.now(), pages = 12): Promise<{ configured: boolean; listings: CofounderListing[] }> {
  // Shared, slow-changing and the same for everyone, so a short in-memory copy is safe: one search reads the gateway once, not per source and per result.
  if (memo && now - memo.at < 5 * 60_000) return memo.value;
  const value = await readGateway(now, pages);
  if (value.configured) memo = { at: now, value };
  return value;
}
let memo: { at: number; value: { configured: boolean; listings: CofounderListing[] } } | null = null;
export const forgetGatewayOutside = () => (memo = null);

async function readGateway(now: number, pages: number): Promise<{ configured: boolean; listings: CofounderListing[] }> {
  const out: CofounderListing[] = [];
  const seen = new Set<string>();
  let configured = true;
  for (let page = 0; page < pages; page++) {
    const g = await gatewayListings("cofounders", { query: "", limit: 100, offset: page * 100 });
    configured = g.configured;
    if (!g.configured) break;
    for (const l of g.results) {
      const c = fromGateway(l, now);
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
    if (g.results.length < 100) break;
  }
  return { configured, listings: out };
}
