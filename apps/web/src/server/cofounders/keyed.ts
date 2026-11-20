/**
 * Co-founders' two keyed outside sources (owner, 2026-11-05, WJ-612). Both need a key the owner sets in Admin → Keys, so
 * until then each says "Needs setup" and nothing is fetched. Neither has been run against the live service (no key
 * was available when they were written): they are tested against recorded response shapes only.
 *
 * - Reddit: the official Data API with an app's client credentials (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET): recent posts in
 *   r/cofounder and a co-founder search of r/startups, r/Entrepreneur, r/SideProject and r/StartUpIndia. A post is its title, the
 *   first lines of its text (email addresses and phone numbers removed), its date and the author's public handle only.
 *   Terms pending: Reddit's Data API terms limit commercial use.
 * - Product Hunt: API v2 (PRODUCTHUNT_TOKEN, a developer token): the newest products as startups (name, tagline, link). The
 *   makers are people and are never read. Terms pending: its API terms limit commercial use.
 *
 * Reddit and Product Hunt are asked at most once every six hours per instance (an answer is kept in memory), so a
 * person's search never reaches them directly more often than that; WorksLake also keeps a source's answer for a day.
 */
import { scrubContacts } from "../../../../data-gateway/src/core.mjs";
import { platformKey } from "../jobslake/platformKeys";
import { excerpt } from "./outside";
import { POST_MAX_AGE_DAYS, type CofounderListing } from "@/modules/cofounders/domain";

export const REDDIT = "Reddit";
export const PRODUCT_HUNT = "Product Hunt";
const UA = "WonderWorks/1.0 (co-founder posts; a generic client, no personal contact)";
const SUBREDDITS: { sub: string; search?: string }[] = [{ sub: "cofounder" }, { sub: "startups", search: "co-founder" }, { sub: "Entrepreneur", search: "co-founder" }, { sub: "SideProject", search: "co-founder" }, { sub: "StartUpIndia", search: "co-founder" }];
const WANTS = /(look|seek|search|need|want|find|hiring).{0,30}(co-?founder|cto|founding (engineer|team))|co-?founder (wanted|needed|search)|(technical|business|sales|non-technical) co-?founder/i;
const SIX_HOURS = 6 * 3_600_000;

export const redditAvailable = () => !!platformKey("REDDIT_CLIENT_ID") && !!platformKey("REDDIT_CLIENT_SECRET");
export const productHuntAvailable = () => !!platformKey("PRODUCTHUNT_TOKEN");

type Fetch = typeof fetch;
const memo = new Map<string, { at: number; value: CofounderListing[] }>();
async function cached(key: string, now: number, load: () => Promise<CofounderListing[]>): Promise<CofounderListing[]> {
  const had = memo.get(key);
  if (had && now - had.at < SIX_HOURS) return had.value;
  const value = await load();
  memo.set(key, { at: now, value });
  return value;
}
export const forgetKeyed = () => memo.clear();

interface RedditPost { id?: string; title?: string; selftext?: string; author?: string; created_utc?: number; permalink?: string; subreddit?: string; over_18?: boolean; removed_by_category?: string | null }

/** A Reddit post as a listing, or null for one that is old, removed, adult, not a co-founder request, or has no link. */
export function postFromReddit(p: RedditPost, now: number): CofounderListing | null {
  const title = scrubContacts((p.title ?? "").replace(/\s+/g, " ").trim()).slice(0, 240);
  const at = typeof p.created_utc === "number" ? p.created_utc * 1000 : NaN;
  if (!p.id || !title || !p.permalink || p.over_18 || p.removed_by_category) return null;
  if (!Number.isFinite(at) || now - at > POST_MAX_AGE_DAYS * 86_400_000) return null;
  if (!WANTS.test(title)) return null;
  const author = (p.author ?? "").trim();
  const handle = author && author !== "[deleted]" && /^[\w-]{1,40}$/.test(author) ? author : undefined;
  return { id: `reddit_${p.id}`, kind: "post", title, company: REDDIT, location: "", terms: handle ? { handle } : {}, description: excerpt(scrubContacts(p.selftext ?? "")), postedAt: new Date(at).toISOString(), url: `https://www.reddit.com${p.permalink}`, sourceId: "cof_reddit", sourceName: `${REDDIT}${p.subreddit ? ` r/${p.subreddit}` : ""}`, shareable: true };
}

export async function redditPosts(now = Date.now(), f: Fetch = fetch): Promise<CofounderListing[]> {
  const id = platformKey("REDDIT_CLIENT_ID");
  const secret = platformKey("REDDIT_CLIENT_SECRET");
  if (!id || !secret) return [];
  return cached("reddit", now, async () => {
    const t = await f("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { "user-agent": UA, authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(15_000) });
    if (!t.ok) throw new Error(`Reddit refused the app's credentials (${t.status})`);
    const token = ((await t.json()) as { access_token?: string }).access_token;
    if (!token) throw new Error("Reddit gave no access token");
    const out: CofounderListing[] = [];
    const seen = new Set<string>();
    for (const { sub, search } of SUBREDDITS) {
      const url = search ? `https://oauth.reddit.com/r/${sub}/search?q=${encodeURIComponent(search)}&restrict_sr=1&sort=new&limit=100` : `https://oauth.reddit.com/r/${sub}/new?limit=100`;
      const r = await f(url, { headers: { "user-agent": UA, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      // A rate limit or a refusal is a stop, never something to get past: what was read so far is kept.
      if (r.status === 429 || r.status === 403) break;
      if (!r.ok) continue;
      const data = (await r.json()) as { data?: { children?: { data?: RedditPost }[] } };
      for (const c of data.data?.children ?? []) {
        const l = c.data ? postFromReddit(c.data, now) : null;
        if (l && !seen.has(l.id)) {
          seen.add(l.id);
          out.push(l);
        }
      }
      await new Promise((ok) => setTimeout(ok, 1_000));
    }
    return out;
  });
}

interface PhPost { id?: string; name?: string; tagline?: string; description?: string; url?: string; website?: string; createdAt?: string; topics?: { edges?: { node?: { name?: string } }[] } }

/** A Product Hunt product as a startup listing (the company, never its makers), or null when it has no name or link. */
export function startupFromProductHunt(p: PhPost): CofounderListing | null {
  const url = typeof p.url === "string" && /^https:\/\/www\.producthunt\.com\//.test(p.url) ? p.url.split("?")[0] : undefined;
  const name = (p.name ?? "").replace(/\s+/g, " ").trim();
  if (!p.id || !name || !url) return null;
  const at = p.createdAt && Number.isFinite(Date.parse(p.createdAt)) ? new Date(p.createdAt).toISOString() : undefined;
  const line = (p.tagline ?? "").replace(/\s+/g, " ").trim();
  return { id: `producthunt_${p.id}`, kind: "startup", title: name, company: line || PRODUCT_HUNT, location: "", terms: {}, description: excerpt(p.description || line), ...(at ? { postedAt: at } : {}), url, sourceId: "cof_producthunt", sourceName: PRODUCT_HUNT, shareable: true };
}

export async function productHuntStartups(now = Date.now(), f: Fetch = fetch): Promise<CofounderListing[]> {
  const token = platformKey("PRODUCTHUNT_TOKEN");
  if (!token) return [];
  return cached("producthunt", now, async () => {
    // Only the product's own fields: no maker, no user, no vote or comment is requested.
    const query = "query { posts(order: NEWEST, first: 50) { nodes { id name tagline description url createdAt } } }";
    const r = await f("https://api.producthunt.com/v2/api/graphql", { method: "POST", headers: { "user-agent": UA, authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Product Hunt answered ${r.status}`);
    const data = (await r.json()) as { data?: { posts?: { nodes?: PhPost[] } } };
    return (data.data?.posts?.nodes ?? []).flatMap((p) => startupFromProductHunt(p) ?? []);
  });
}
