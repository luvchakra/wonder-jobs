/**
 * YouTube as a live provider of channels (WJ-822, WJ-823). YouTube Data API v3, read on 2026-11-11:
 * developers.google.com/youtube/v3/docs/search/list (GET search, part=snippet, type=channel, q, regionCode,
 * relevanceLanguage, maxResults 0-50, pageToken) and .../docs/channels/list (GET channels by id, parts snippet,
 * statistics and topicDetails). A search finds the channels; one channels call reads what each states about itself.
 *
 * A channel is a public outlet: its name, link, topics, country and language as the channel states them, and its
 * subscriber count as YouTube publishes it (rounded to three figures, null when the channel hides it). Never an owner's
 * name or email. Terms pending: YouTube's developer policies (III.E.4) allow keeping statistics 30 days at most and
 * require showing YouTube as the source; they restrict passing API data on (III.G.1), which the owner confirms.
 */
import { callJson, count, countryOf, list, str, wordsOf } from "./shared.mjs";

const API = "https://www.googleapis.com/youtube/v3/";
/** A topic as YouTube states it (a Wikipedia link, "https://en.wikipedia.org/wiki/Lifestyle_(sociology)"), as words. */
function topicOf(link) {
  try { const last = decodeURIComponent(new URL(link).pathname.split("/").pop() ?? ""); return str(last.replace(/_/g, " ").replace(/\s*\(.*\)$/, ""), 60)?.toLowerCase() ?? null; } catch { return null; }
}

function channel(c, at) {
  const name = str(c?.snippet?.title, 200);
  if (typeof c?.id !== "string" || !/^[\w-]{10,40}$/.test(c.id) || !name) return null;
  const handle = typeof c.snippet.customUrl === "string" && /^@[\w.-]{2,60}$/.test(c.snippet.customUrl) ? c.snippet.customUrl : null;
  const url = handle ? "https://www.youtube.com/" + handle : "https://www.youtube.com/channel/" + c.id;
  const subscribers = c.statistics?.hiddenSubscriberCount === true ? null : count(c.statistics?.subscriberCount);
  const country = typeof c.snippet.country === "string" && /^[A-Za-z]{2}$/.test(c.snippet.country) ? c.snippet.country.toUpperCase() : null;
  return {
    id: "youtube_" + c.id, kind: "channel", channelType: "youtube_channel", name, url,
    topics: [...new Set(list(c.topicDetails?.topicCategories).map(topicOf).filter(Boolean))].slice(0, 8),
    audience: subscribers !== null ? { value: subscribers, unit: "subscribers", asOf: at.slice(0, 10) } : null,
    language: typeof c.snippet.defaultLanguage === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(c.snippet.defaultLanguage) ? c.snippet.defaultLanguage.toLowerCase() : null,
    location: { text: null, country }, contactUrl: null, description: str(c.snippet.description, 600),
    source: { id: "youtube", provider: "youtube", name: "YouTube Data API", url, termsPending: true }, observedAt: at,
  };
}

export default {
  id: "youtube", label: "YouTube channels", kinds: ["channel"], channelTypes: ["youtube_channel"], paid: false, units: 0, coverage: ["global"], attribution: "YouTube", termsPending: true,
  keys: ["YOUTUBE_API_KEY"], maxPage: 50, defaultCacheHours: 24,
  async search(plan, ctx) {
    const headers = { accept: "application/json", "x-goog-api-key": ctx.keys.YOUTUBE_API_KEY };
    const country = countryOf(plan), language = plan.languages[0];
    const find = new URL(API + "search");
    find.search = new URLSearchParams({ part: "snippet", type: "channel", q: wordsOf(plan), maxResults: String(ctx.size), ...(country ? { regionCode: country } : {}), ...(language ? { relevanceLanguage: language } : {}), ...(ctx.token ? { pageToken: ctx.token } : {}) }).toString();
    const found = await callJson(ctx, find, { headers });
    const ids = [...new Set(list(found?.items).map((i) => i?.id?.channelId ?? i?.snippet?.channelId).filter((v) => typeof v === "string" && /^[\w-]{10,40}$/.test(v)))];
    const next = typeof found?.nextPageToken === "string" && found.nextPageToken ? found.nextPageToken : null;
    if (!ids.length) return { items: [], next };
    const read = new URL(API + "channels");
    read.search = new URLSearchParams({ part: "snippet,statistics,topicDetails", id: ids.join(","), maxResults: "50" }).toString();
    const detail = await callJson(ctx, read, { headers });
    const at = new Date(ctx.now).toISOString();
    const byId = new Map(list(detail?.items).map((c) => [c?.id, channel(c, at)]));
    // In the search's own order; a channel the second call did not describe is left out, not half-filled.
    return { items: ids.map((id) => byId.get(id)).filter(Boolean), next };
  },
};
