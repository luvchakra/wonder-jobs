/**
 * Facebook, Instagram and LinkedIn as live providers of channels (WJ-847; docs/PROSPECT_DATA_API.md). None of the three
 * offers a public search API: Facebook's Pages Search needs Meta's app review, Instagram's Business Discovery only reads
 * an account whose name is already known, and LinkedIn's organisation APIs are for approved partners. So these never
 * call Facebook, Instagram or LinkedIn at all. They ask the Brave Search API (api.search.brave.com/res/v1/web/search,
 * header X-Subscription-Token; read on 2026-11-22) for the public pages a search engine already indexes on that site,
 * and keep only a page that is an outlet, never a person:
 *
 *   - Facebook: a page or a public group whose result states its likes, followers or members. A personal profile
 *     (profile.php, /people/, a result that speaks of friends) is left out.
 *   - Instagram: an account whose result states its followers, and at least MIN_INSTAGRAM_FOLLOWERS of them (a public
 *     outlet, not someone's own account). Posts, reels and tags are left out.
 *   - LinkedIn: a company or showcase page only. A member's profile (/in/, /pub/), a post or a group is never kept.
 *
 * What is kept is the page's name, link and one-line description as the search result states them, and its audience
 * when the result states one (never estimated). Nothing is read from the page itself. Terms pending: Brave's Search API
 * terms on storing results and passing them to another product.
 */
import { ProviderError, callJson, list, placeOf, publishedEmail, str, wordsOf } from "./shared.mjs";

const API = "https://api.search.brave.com/res/v1/web/search";
/** Brave answers at most 20 results a call and an offset of 0-9 pages. */
const PAGE = 20;
const MAX_OFFSET = 9;
export const MIN_INSTAGRAM_FOLLOWERS = 1000;

/** "12K", "1.2M", "3,456" → a whole number, or null. */
export function statedNumber(text) {
  const m = /^([\d.,]+)\s*([KkMm])?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  const scale = m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1;
  return Math.round(n * scale);
}

/** The audience a result's text states ("12K followers", "5.2K members", "3,456 likes"), with its unit, or null. */
export function statedAudience(text, units) {
  for (const unit of units) {
    const m = new RegExp(String.raw`([\d][\d.,]*\s*[KkMm]?)\s+${unit}\b`, "i").exec(text ?? "");
    const value = m ? statedNumber(m[1]) : null;
    if (value !== null) return { value, unit };
  }
  return null;
}

const FACEBOOK_NOT_PAGES = new Set(["profile.php", "people", "watch", "events", "marketplace", "story.php", "photo", "photo.php", "photos", "permalink.php", "share", "sharer", "sharer.php", "login", "login.php", "help", "hashtag", "reel", "reels", "posts", "videos", "gaming", "public", "search", "friends", "messages", "notes", "media", "ads", "business", "privacy", "policies", "legal", "pages"]);
const INSTAGRAM_NOT_ACCOUNTS = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "about", "developer", "legal", "direct", "web", "privacy", "tags", "locations"]);

function pathParts(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase().replace(/^(www|m|web|[a-z]{2})\./, ""), parts: u.pathname.split("/").filter(Boolean) };
  } catch { return null; }
}

const SITES = {
  facebook: {
    site: "facebook.com",
    read(result) {
      const at = pathParts(result.url);
      if (!at || at.host !== "facebook.com" || !at.parts.length) return null;
      const text = `${result.title ?? ""} ${result.description ?? ""}`;
      if (/\bfriends\b/i.test(text)) return null;
      if (at.parts[0] === "groups") {
        const id = at.parts[1];
        if (!id || !/^[\w.-]{2,80}$/.test(id)) return null;
        const audience = statedAudience(text, ["members"]);
        if (!audience) return null;
        return { key: "group_" + id.toLowerCase(), url: `https://www.facebook.com/groups/${id}/`, channelType: "community", audience };
      }
      const handle = at.parts[0];
      if (FACEBOOK_NOT_PAGES.has(handle.toLowerCase()) || !/^[\w.-]{2,80}$/.test(handle)) return null;
      const audience = statedAudience(text, ["followers", "likes"]);
      if (!audience) return null;
      return { key: handle.toLowerCase(), url: `https://www.facebook.com/${handle}/`, channelType: "organisation", audience };
    },
    titleCut: /\s*[|–-]\s*Facebook\s*$/i,
  },
  instagram: {
    site: "instagram.com",
    read(result) {
      const at = pathParts(result.url);
      if (!at || at.host !== "instagram.com" || at.parts.length !== 1) return null;
      const handle = at.parts[0];
      if (INSTAGRAM_NOT_ACCOUNTS.has(handle.toLowerCase()) || !/^[A-Za-z0-9._]{2,30}$/.test(handle)) return null;
      const audience = statedAudience(`${result.description ?? ""} ${result.title ?? ""}`, ["followers"]);
      if (!audience || audience.value < MIN_INSTAGRAM_FOLLOWERS) return null;
      return { key: handle.toLowerCase(), url: `https://www.instagram.com/${handle}/`, channelType: "publication", audience };
    },
    titleCut: /\s*[•·|]\s*Instagram.*$|\s*\(@[A-Za-z0-9._]+\).*$/i,
  },
  linkedin: {
    site: "linkedin.com/company",
    read(result) {
      const at = pathParts(result.url);
      if (!at || at.host !== "linkedin.com" || at.parts.length < 2) return null;
      if (at.parts[0] !== "company" && at.parts[0] !== "showcase") return null;
      const slug = at.parts[1];
      if (!/^[\w%.-]{2,100}$/.test(slug)) return null;
      return { key: slug.toLowerCase(), url: `https://www.linkedin.com/${at.parts[0]}/${slug}/`, channelType: "organisation", audience: statedAudience(`${result.description ?? ""} ${result.title ?? ""}`, ["followers"]) };
    },
    titleCut: /\s*[|–-]\s*LinkedIn\s*$/i,
  },
};

function makeProvider({ id, label, name, site }) {
  const rules = SITES[id];
  return {
    id, label, kinds: ["channel"], channelTypes: [...new Set(["community", "organisation", "publication"])], paid: false, units: 0, coverage: ["global"],
    attribution: `${name} (found through Brave Search)`, termsPending: true, cost: "free",
    keys: ["BRAVE_SEARCH_API_KEY"], maxPage: PAGE, defaultCacheHours: 24,
    async search(plan, ctx) {
      const offset = ctx.token && /^[1-9]$/.test(ctx.token) ? Number(ctx.token) : 0;
      const words = [wordsOf(plan), placeOf(plan)].filter(Boolean).join(" ");
      if (!words) return { items: [], next: null };
      const u = new URL(API);
      u.search = new URLSearchParams({ q: `site:${site ?? rules.site} ${words}`, count: String(Math.min(ctx.size, PAGE)), offset: String(offset), safesearch: "strict", text_decorations: "false" }).toString();
      const answer = await callJson(ctx, u, { headers: { accept: "application/json", "x-subscription-token": ctx.keys.BRAVE_SEARCH_API_KEY } });
      if (answer && typeof answer !== "object") throw new ProviderError("malformed");
      const at = new Date(ctx.now).toISOString();
      const seen = new Set();
      const items = [];
      for (const r of list(answer?.web?.results)) {
        const page = rules.read({ url: r?.url, title: str(r?.title, 300), description: str(r?.description, 600) });
        if (!page || seen.has(page.key)) continue;
        seen.add(page.key);
        const title = str(r.title, 300)?.replace(rules.titleCut, "").trim();
        if (!title) continue;
        // WJ-870: an enquiry address the page wrote in its own profile text, as the search result shows it.
        const contactEmail = publishedEmail(typeof r.description === "string" ? r.description : null);
        items.push({
          id: `${id}_${page.key}`.slice(0, 120), kind: "channel", channelType: page.channelType, name: title.slice(0, 200), url: page.url,
          topics: [], audience: page.audience ? { value: page.audience.value, unit: page.audience.unit, asOf: at.slice(0, 10) } : null,
          language: null, location: { text: null, country: null }, contactUrl: null,
          contactEmail, contactEmailSource: contactEmail ? "profile text in the search result" : null, description: str(r.description, 600),
          source: { id, provider: id, name, url: page.url, termsPending: true }, observedAt: at,
        });
      }
      const more = answer?.query?.more_results_available === true && offset < MAX_OFFSET;
      return { items, next: more ? String(offset + 1) : null };
    },
  };
}

export const facebook = makeProvider({ id: "facebook", label: "Facebook pages and groups", name: "Facebook" });
export const instagram = makeProvider({ id: "instagram", label: "Instagram accounts", name: "Instagram" });
export const linkedin = makeProvider({ id: "linkedin", label: "LinkedIn company pages", name: "LinkedIn" });
