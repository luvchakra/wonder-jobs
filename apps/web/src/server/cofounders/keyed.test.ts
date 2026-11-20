import { beforeEach, describe, expect, it, vi } from "vitest";

const keys = vi.hoisted(() => ({ REDDIT_CLIENT_ID: undefined as string | undefined, REDDIT_CLIENT_SECRET: undefined as string | undefined, PRODUCTHUNT_TOKEN: undefined as string | undefined }));
vi.mock("../jobslake/platformKeys", () => ({ platformKey: (n: keyof typeof keys) => keys[n] }));

import { forgetKeyed, postFromReddit, productHuntAvailable, productHuntStartups, redditAvailable, redditPosts, startupFromProductHunt } from "./keyed";

const NOW = Date.parse("2026-11-07T00:00:00Z");
const secs = (daysAgo: number) => (NOW - daysAgo * 86_400_000) / 1000;
const post = (over: Record<string, unknown> = {}) => ({ id: "abc1", title: "Looking for a technical co-founder for a fintech idea", selftext: "I build payments. Email me at raj@example.com or +91 98765 43210.", author: "raj_builds", created_utc: secs(2), permalink: "/r/cofounder/comments/abc1/looking/", subreddit: "cofounder", ...over });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  keys.REDDIT_CLIENT_ID = keys.REDDIT_CLIENT_SECRET = keys.PRODUCTHUNT_TOKEN = undefined;
  forgetKeyed();
});

describe("without a key, nothing is fetched", () => {
  it("says it is not available and returns nothing, without calling out", async () => {
    const f = vi.fn();
    expect(redditAvailable()).toBe(false);
    expect(productHuntAvailable()).toBe(false);
    expect(await redditPosts(NOW, f as never)).toEqual([]);
    expect(await productHuntStartups(NOW, f as never)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    keys.REDDIT_CLIENT_ID = "id";
    expect(redditAvailable()).toBe(false);
  });
});

describe("a Reddit post", () => {
  it("is the title, a scrubbed excerpt, the date and the public handle, linking to the post", () => {
    const l = postFromReddit(post(), NOW)!;
    expect(l).toMatchObject({ id: "reddit_abc1", kind: "post", terms: { handle: "raj_builds" }, url: "https://www.reddit.com/r/cofounder/comments/abc1/looking/", sourceId: "cof_reddit", sourceName: "Reddit r/cofounder" });
    expect(JSON.stringify(l)).not.toMatch(/raj@example|98765/);
  });

  it("is left out when old, removed, adult, undated, not a co-founder request, or its author deleted the account (no handle)", () => {
    expect(postFromReddit(post({ created_utc: secs(61) }), NOW)).toBeNull();
    expect(postFromReddit(post({ removed_by_category: "moderator" }), NOW)).toBeNull();
    expect(postFromReddit(post({ over_18: true }), NOW)).toBeNull();
    expect(postFromReddit(post({ created_utc: undefined }), NOW)).toBeNull();
    expect(postFromReddit(post({ title: "How do I pitch to investors?" }), NOW)).toBeNull();
    expect(postFromReddit(post({ author: "[deleted]" }), NOW)!.terms).toEqual({});
  });
});

describe("reading Reddit with an app's credentials", () => {
  it("gets a token, asks each subreddit once with a generic User-Agent, keeps the requests it matched once, and remembers the answer six hours", async () => {
    keys.REDDIT_CLIENT_ID = "id";
    keys.REDDIT_CLIENT_SECRET = "secret";
    const seen: { url: string; ua?: string; auth?: string }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const h = (init?.headers ?? {}) as Record<string, string>;
      seen.push({ url: u, ua: h["user-agent"], auth: h.authorization });
      if (u.endsWith("/access_token")) return json({ access_token: "tok" });
      return json({ data: { children: [{ data: post() }, { data: post({ id: "x2", title: "Weekend plans?" }) }] } });
    });
    vi.useFakeTimers();
    const run = redditPosts(NOW, f as never);
    await vi.runAllTimersAsync();
    const out = await run;
    vi.useRealTimers();
    expect(out.map((l) => l.id)).toEqual(["reddit_abc1"]);
    expect(f).toHaveBeenCalledTimes(6);
    expect(seen[0].auth).toMatch(/^Basic /);
    expect(seen[1].auth).toBe("Bearer tok");
    for (const s of seen) expect(s.ua).toMatch(/^WonderWorks\/1\.0/);
    expect(seen[1].url).toContain("/r/cofounder/new");
    expect(await redditPosts(NOW + 3_600_000, f as never)).toEqual(out);
    expect(f).toHaveBeenCalledTimes(6);
  });

  it("stops at a rate limit or a refusal and keeps what it had; a refused app is an error, never worked around", async () => {
    keys.REDDIT_CLIENT_ID = "id";
    keys.REDDIT_CLIENT_SECRET = "secret";
    let n = 0;
    const f = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/access_token")) return json({ access_token: "tok" });
      return n++ === 0 ? json({ data: { children: [{ data: post() }] } }) : json({}, 429);
    });
    vi.useFakeTimers();
    const run = redditPosts(NOW, f as never);
    await vi.runAllTimersAsync();
    const out = await run;
    vi.useRealTimers();
    expect(out).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(3);
    forgetKeyed();
    await expect(redditPosts(NOW, (async () => json({}, 401)) as never)).rejects.toThrow(/refused/);
  });
});

describe("Product Hunt", () => {
  const node = (over: Record<string, unknown> = {}) => ({ id: "1", name: "Chaser", tagline: "Invoices that chase themselves", description: "Get paid on time.", url: "https://www.producthunt.com/posts/chaser?utm=x", createdAt: "2026-11-05T10:00:00Z", ...over });

  it("is a startup (the company), never its makers", () => {
    const l = startupFromProductHunt(node())!;
    expect(l).toMatchObject({ id: "producthunt_1", kind: "startup", title: "Chaser", company: "Invoices that chase themselves", url: "https://www.producthunt.com/posts/chaser", sourceId: "cof_producthunt", sourceName: "Product Hunt" });
    expect(startupFromProductHunt(node({ url: "https://evil.example/x" }))).toBeNull();
    expect(startupFromProductHunt(node({ name: "" }))).toBeNull();
  });

  it("asks for the product's own fields only, with the token, and remembers the answer", async () => {
    keys.PRODUCTHUNT_TOKEN = "t0k";
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return json({ data: { posts: { nodes: [node(), node({ id: "2", url: "http://x" })] } } });
    });
    const out = await productHuntStartups(NOW, f as never);
    expect(out.map((l) => l.id)).toEqual(["producthunt_1"]);
    const sent = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(sent.query).not.toMatch(/maker|user|vote|comment|email|twitter|username/i);
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer t0k");
    await productHuntStartups(NOW + 1000, f as never);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
