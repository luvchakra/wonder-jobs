/**
 * Podcast Index as a live provider of podcasts (WJ-822, WJ-823). Its API reference, read on 2026-11-11
 * (podcastindex-org.github.io/docs-api, the OpenAPI file in github.com/Podcastindex-org/docs-api): base
 * https://api.podcastindex.org/api/1.0; every call sends User-Agent, X-Auth-Key, X-Auth-Date (the time now, in
 * seconds) and Authorization, the SHA-1 of key + secret + date in lower-case hex. GET /search/byterm?q=&max= (1-1000)
 * matches a feed's title, author or owner and answers { status, feeds, count }; there is no next page.
 *
 * A podcast is a public outlet: its title, site, categories and language. The index states no audience size, so
 * `audience` is null. An author's or owner's name is not returned. Terms pending: the API's terms of use for storing
 * and passing results on were not found to read; the owner confirms.
 */
import { createHash } from "node:crypto";
import { callJson, count, httpsUrl, list, str, wordsOf } from "./shared.mjs";

const SEARCH = "https://api.podcastindex.org/api/1.0/search/byterm";
/** The four headers the API asks for, for one moment in time. */
export function podcastIndexHeaders(key, secret, now) {
  const date = String(Math.floor(now / 1000));
  return { "user-agent": "WorksLakeGateway/1.0", "x-auth-key": key, "x-auth-date": date, authorization: createHash("sha1").update(key + secret + date).digest("hex") };
}

function podcast(f, at) {
  const name = str(f?.title, 200);
  const feed = httpsUrl(f?.url);
  const url = httpsUrl(f?.link) ?? feed;
  if (!Number.isInteger(f?.id) || !name || !url || f.dead === 1) return null;
  const cats = f.categories && typeof f.categories === "object" && !Array.isArray(f.categories) ? Object.values(f.categories) : [];
  return {
    id: "podcast_index_" + f.id, kind: "channel", channelType: "podcast", name, url,
    topics: [...new Set(cats.map((c) => str(c, 60)?.toLowerCase()).filter(Boolean))].slice(0, 8),
    audience: null,
    language: typeof f.language === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(f.language.trim()) ? f.language.trim().toLowerCase() : null,
    location: { text: null, country: null }, contactUrl: null, description: str(f.description, 600),
    ...(count(f.episodeCount) !== null ? { episodes: count(f.episodeCount) } : {}),
    source: { id: "podcast_index", provider: "podcast_index", name: "Podcast Index", url: feed ?? url, termsPending: true }, observedAt: at,
  };
}

export default {
  id: "podcast_index", label: "Podcast Index", kinds: ["channel"], channelTypes: ["podcast"], paid: false, units: 0, coverage: ["global"], attribution: "Podcast Index (podcastindex.org)", termsPending: true,
  keys: ["PODCAST_INDEX_KEY", "PODCAST_INDEX_SECRET"], maxPage: 50, defaultCacheHours: 24,
  async search(plan, ctx) {
    const u = new URL(SEARCH);
    u.search = new URLSearchParams({ q: wordsOf(plan), max: String(ctx.size) }).toString();
    const answer = await callJson(ctx, u, { headers: { accept: "application/json", ...podcastIndexHeaders(ctx.keys.PODCAST_INDEX_KEY, ctx.keys.PODCAST_INDEX_SECRET, ctx.now) } });
    const at = new Date(ctx.now).toISOString();
    const wanted = plan.languages.map((l) => l.toLowerCase());
    const items = list(answer?.feeds).map((f) => podcast(f, at)).filter(Boolean).filter((p) => !wanted.length || (p.language !== null && wanted.some((l) => p.language === l || p.language.startsWith(l + "-"))));
    return { items, next: null };
  },
};
