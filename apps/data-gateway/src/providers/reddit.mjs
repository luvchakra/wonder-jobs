/**
 * Reddit communities as a live provider of channels (WJ-826; docs/PROSPECT_DATA_API.md, A6). Reddit's official API
 * (reddit.com/dev/api, OAuth2 app-only flow per github.com/reddit-archive/reddit/wiki/OAuth2): POST
 * www.reddit.com/api/v1/access_token with the app's client id and secret (grant_type=client_credentials) gives a
 * bearer token; GET oauth.reddit.com/subreddits/search?q=&limit= (at most 100)&after= answers a Listing
 * { data: { after, children: [{ kind: "t5", data: { name, display_name, display_name_prefixed, title,
 * public_description, subscribers, url, over18, lang, subreddit_type } }] } }. Every call sends a descriptive
 * User-Agent, as Reddit asks.
 *
 * A subreddit is a public community: its name, link, one-line description, language and stated subscriber count. No
 * post, no member and no moderator is read. A user's own profile space (u_…), a private or over-18 community is left
 * out. Uses the same app keys as the Co-founders Reddit source. Terms pending: Reddit's Data API terms are reported to
 * require a separate agreement for commercial use; neither redditinc.com nor reddit.com answered the build network on
 * 2026-11-12, so they were not read (owner decision `prospects-community-sources`).
 */
import { ProviderError, callJson, count, list, str, wordsOf } from "./shared.mjs";

const TOKEN = "https://www.reddit.com/api/v1/access_token";
const SEARCH = "https://oauth.reddit.com/subreddits/search";
const UA = "WorksLakeGateway/1.0 (prospect data; channel search)";

function community(d, at) {
  const handle = typeof d?.display_name === "string" && /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(d.display_name) ? d.display_name : null;
  if (!handle || handle.startsWith("u_") || d.over18 === true || (d.subreddit_type !== undefined && d.subreddit_type !== "public")) return null;
  const url = "https://www.reddit.com/r/" + handle + "/";
  const subscribers = count(d.subscribers);
  return {
    id: "reddit_" + handle.toLowerCase(), kind: "channel", channelType: "community", name: "r/" + handle, url,
    topics: [],
    audience: subscribers !== null ? { value: subscribers, unit: "members", asOf: at.slice(0, 10) } : null,
    language: typeof d.lang === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(d.lang) ? d.lang.toLowerCase() : null,
    location: { text: null, country: null }, contactUrl: null, description: str(d.public_description, 600) ?? str(d.title, 200),
    source: { id: "reddit", provider: "reddit", name: "Reddit", url, termsPending: true }, observedAt: at,
  };
}

export default {
  id: "reddit", label: "Reddit communities", kinds: ["channel"], channelTypes: ["community"], paid: false, units: 0, coverage: ["global"], attribution: "Reddit", termsPending: true,
  cost: "free",
  keys: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"], maxPage: 100, defaultCacheHours: 24,
  async search(plan, ctx) {
    const basic = Buffer.from(ctx.keys.REDDIT_CLIENT_ID + ":" + ctx.keys.REDDIT_CLIENT_SECRET).toString("base64");
    const grant = await callJson(ctx, TOKEN, { method: "POST", headers: { authorization: "Basic " + basic, "content-type": "application/x-www-form-urlencoded", "user-agent": UA, accept: "application/json" }, body: "grant_type=client_credentials" });
    if (typeof grant?.access_token !== "string" || !grant.access_token) throw new ProviderError("refused");
    const u = new URL(SEARCH);
    u.search = new URLSearchParams({ q: wordsOf(plan), limit: String(ctx.size), raw_json: "1", include_over_18: "false", ...(ctx.token ? { after: ctx.token } : {}) }).toString();
    const answer = await callJson(ctx, u, { headers: { authorization: "Bearer " + grant.access_token, "user-agent": UA, accept: "application/json" } });
    const at = new Date(ctx.now).toISOString();
    const wanted = plan.languages.map((l) => l.toLowerCase());
    const items = list(answer?.data?.children).filter((c) => c?.kind === "t5").map((c) => community(c.data, at)).filter(Boolean)
      .filter((c) => !wanted.length || (c.language !== null && wanted.some((l) => c.language === l || c.language.startsWith(l + "-"))));
    const after = answer?.data?.after;
    return { items, next: typeof after === "string" && /^t5_[a-z0-9]{1,12}$/i.test(after) ? after : null };
  },
};
