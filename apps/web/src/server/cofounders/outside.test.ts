import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] as { offset: number }[], pages: [] as unknown[][], configured: true }));
vi.mock("../gateway/listings", () => ({
  gatewayListings: vi.fn(async (_m: string, input: { offset?: number }) => {
    calls.list.push({ offset: input.offset ?? 0 });
    return { configured: calls.configured, results: calls.pages[(input.offset ?? 0) / 100] ?? [], sources: [] };
  }),
}));

import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { forgetGatewayOutside, fromGateway, gatewayOutside } from "./outside";

const NOW = Date.parse("2026-11-07T00:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const gw = (over: Partial<GatewayListing> & { attributes?: Record<string, string | number | boolean> }): GatewayListing => ({ id: "cofounders_a1", module: "cofounders", sourceId: "src_1", sourceName: "Hacker News", sourceMethod: "json_api", title: "Looking for a technical co-founder", organization: "", location: "", description: "Building payments for small shops.", canonicalUrl: "https://news.ycombinator.com/item?id=1", publishedAt: day(3), observedAt: day(1), expiresAt: day(-20), remote: false, attributes: { handle: "raj" }, status: "active", ...over });

beforeEach(() => {
  calls.list.length = 0;
  calls.pages = [];
  calls.configured = true;
  forgetGatewayOutside();
});

describe("a post from the gateway", () => {
  it("is its title, excerpt, date and the author's public handle, linking back — and nothing else", () => {
    const l = fromGateway(gw({}), NOW)!;
    expect(l).toMatchObject({ id: "cofounders_a1", kind: "post", title: "Looking for a technical co-founder", terms: { handle: "raj" }, url: "https://news.ycombinator.com/item?id=1", sourceId: "cof_outside", sourceName: "Hacker News", shareable: true });
    expect(Object.keys(l).sort()).toEqual(["company", "description", "id", "kind", "location", "postedAt", "shareable", "sourceId", "sourceName", "terms", "title", "url"]);
  });

  it("is left out when it is older than 60 days, undated, from the future, or has no https link", () => {
    expect(fromGateway(gw({ publishedAt: day(61) }), NOW)).toBeNull();
    expect(fromGateway(gw({ publishedAt: day(59) }), NOW)).not.toBeNull();
    expect(fromGateway(gw({ publishedAt: null }), NOW)).toBeNull();
    expect(fromGateway(gw({ publishedAt: day(-10) }), NOW)).toBeNull();
    expect(fromGateway(gw({ canonicalUrl: "http://news.ycombinator.com/item?id=1" }), NOW)).toBeNull();
    expect(fromGateway(gw({ sourceName: "Some Other Source" }), NOW)).toBeNull();
  });

  it("never carries an email address or a phone number, even if the stored copy still has one", () => {
    const l = fromGateway(gw({ title: "Co-founder wanted — write to jane@example.com", description: "Call me on +91 98765 43210 or telegram: @jane_x about the fintech idea." }), NOW)!;
    expect(JSON.stringify(l)).not.toMatch(/jane@example|98765|@jane_x/);
    expect(l.description).toContain("fintech idea");
  });
});

describe("a startup from the gateway", () => {
  it("is a company with its batch, size and link; no author, and no date it doesn't have", () => {
    const l = fromGateway(gw({ id: "cofounders_y1", sourceName: "Y Combinator", title: "Menza", organization: "", location: "London, England, United Kingdom", publishedAt: null, canonicalUrl: "https://www.ycombinator.com/companies/menza", description: "The AI data analyst for consumer brands.", attributes: { batch: "Winter 2026", teamSize: 3, hiring: false, oneLiner: "The AI data analyst" } }), NOW)!;
    expect(l).toMatchObject({ kind: "startup", title: "Menza", company: "The AI data analyst", location: "London, England, United Kingdom", terms: { batch: "Winter 2026", teamSize: 3, hiring: false }, sourceName: "Y Combinator" });
    expect(l.postedAt).toBeUndefined();
    expect(l.terms.handle).toBeUndefined();
  });
});

describe("reading the gateway", () => {
  it("pages until a short page, keeps each listing once, and reads again only after five minutes", async () => {
    const full = Array.from({ length: 100 }, (_, i) => gw({ id: `cofounders_p${i}`, canonicalUrl: `https://news.ycombinator.com/item?id=${i + 10}` }));
    calls.pages = [full, [gw({ id: "cofounders_p0" }), gw({ id: "cofounders_last", sourceName: "Y Combinator", publishedAt: null, canonicalUrl: "https://www.ycombinator.com/companies/x" })]];
    const a = await gatewayOutside(NOW);
    expect(a.configured).toBe(true);
    expect(a.listings).toHaveLength(101);
    expect(calls.list.map((c) => c.offset)).toEqual([0, 100]);
    await gatewayOutside(NOW + 60_000);
    expect(calls.list).toHaveLength(2);
    await gatewayOutside(NOW + 6 * 60_000);
    expect(calls.list.length).toBeGreaterThan(2);
  });

  it("says it isn't configured, rather than empty, where the gateway isn't set up", async () => {
    calls.configured = false;
    expect(await gatewayOutside(NOW)).toEqual({ configured: false, listings: [] });
  });
});
