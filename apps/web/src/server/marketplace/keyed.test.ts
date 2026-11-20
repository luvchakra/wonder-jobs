import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetPlatformKeys } from "@/server/jobslake/platformKeys";
import type { SearchCriteria } from "@/server/jobs/providers";
import { __resetEbayToken, ebayAvailable, ebaySearch, marketplacesFor, toRawItem as ebayItem } from "./ebay";
import { flipkartAvailable, flipkartSearch, toRawItem as flipkartItem } from "./flipkart";
import { MARKETPLACE_SOURCES, marketplaceSourceAvailable } from "./sources";
import { outsideListing } from "./search";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

const s = { id: "x", name: "Source", limits: { timeoutMs: 1000 } };
const crit = (query: string, locations: string[] = []) => ({ query, locations }) as unknown as SearchCriteria;
const needs = (m: string) => new Error(`NEEDS:${m}`);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  __resetPlatformKeys();
  __resetEbayToken();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const fk = {
  productBaseInfo: {
    productIdentifier: { productId: "MOBX1", categoryPaths: { categoryPath: [[{ title: "Home" }, { title: "Cushion Covers" }]] } },
    productAttributes: {
      title: "Cotton cushion cover",
      productDescription: null,
      imageUrls: { "400x400": "http://rukminim2.flixcart.com/image/400/400/cover.jpeg" },
      sellingPrice: { amount: 499, currency: "INR" },
      productUrl: "http://dl.flipkart.com/dl/cotton-cushion/p/itm1?pid=MOBX1&affid=abc",
      productBrand: "Home Centre",
      inStock: true,
    },
  },
};

describe("Flipkart", () => {
  it("needs both credentials, and says so", async () => {
    expect(flipkartAvailable()).toBe(false);
    vi.stubEnv("FLIPKART_AFFILIATE_ID", "tid");
    expect(flipkartAvailable()).toBe(false);
    await expect(flipkartSearch(s, crit("cushion"), needs)).rejects.toThrow(/NEEDS:Source needs FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN/);
    vi.stubEnv("FLIPKART_AFFILIATE_TOKEN", "tok");
    expect(flipkartAvailable()).toBe(true);
  });
  it("shows only what Flipkart states, with https links", () => {
    const r = flipkartItem(fk)!;
    expect(r).toMatchObject({ externalId: "MOBX1", title: "Cotton cushion cover", company: "Flipkart seller", applyUrl: "https://dl.flipkart.com/dl/cotton-cushion/p/itm1?pid=MOBX1&affid=abc", description: "Home Centre · Home › Cushion Covers" });
    expect(r.attributes).toMatchObject({ price: "499", currency: "INR", category: "Cushion Covers", image: "https://rukminim2.flixcart.com/image/400/400/cover.jpeg" });
  });
  it("leaves out items it can't show honestly", () => {
    const edit = (a: Record<string, unknown>) => ({ productBaseInfo: { ...fk.productBaseInfo, productAttributes: { ...fk.productBaseInfo.productAttributes, ...a } } });
    expect(flipkartItem(edit({ inStock: false }))).toBeNull();
    expect(flipkartItem(edit({ inStock: undefined }))).toBeNull();
    expect(flipkartItem(edit({ sellingPrice: { amount: 10, currency: "USD" } }))).toBeNull();
    expect(flipkartItem(edit({ sellingPrice: undefined }))).toBeNull();
    expect(flipkartItem(edit({ productUrl: "http://evil.example/p" }))).toBeNull();
    expect(flipkartItem(edit({ title: "" }))).toBeNull();
  });
  it("sends the credentials as headers only, asks for the person's words, and never searches without any", async () => {
    vi.stubEnv("FLIPKART_AFFILIATE_ID", "tid");
    vi.stubEnv("FLIPKART_AFFILIATE_TOKEN", "tok");
    const f = vi.fn(async () => json({ productInfoList: [fk, fk] }));
    vi.stubGlobal("fetch", f);
    expect(await flipkartSearch(s, crit("  "), needs)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    const jobs = await flipkartSearch(s, crit("cushion"), needs);
    expect(jobs).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://affiliate-api.flipkart.net/affiliate/search/json?query=cushion&resultCount=10");
    expect(url).not.toMatch(/tid|tok/);
    expect(init.headers).toMatchObject({ "Fk-Affiliate-Id": "tid", "Fk-Affiliate-Token": "tok" });
  });
  it("turns a refusal into Needs setup without naming a credential", async () => {
    vi.stubEnv("FLIPKART_AFFILIATE_ID", "tid-secret");
    vi.stubEnv("FLIPKART_AFFILIATE_TOKEN", "tok-secret");
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 401)));
    const e = await flipkartSearch(s, crit("x"), needs).then(() => new Error("did not throw"), (x: Error) => x);
    expect(e.message).toMatch(/^NEEDS:/);
    expect(e.message).not.toMatch(/tid-secret|tok-secret/);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429)));
    await expect(flipkartSearch(s, crit("x"), needs)).rejects.toThrow(/rate limited/);
  });
});

const eb = { itemId: "v1|1|0", title: "Vintage brass lamp", price: { value: "42.50", currency: "USD" }, condition: "Used", image: { imageUrl: "https://i.ebayimg.com/images/g/a/s-l225.jpg" }, itemWebUrl: "https://www.ebay.com/itm/1", itemLocation: { country: "US" }, itemCreationDate: "2026-11-01T10:00:00.000Z", buyingOptions: ["FIXED_PRICE"], categories: [{ categoryName: "Lamps" }] };

describe("eBay", () => {
  it("picks the marketplaces a place names, else the four English-language ones", () => {
    expect(marketplacesFor(["Manchester, UK"])).toEqual(["EBAY_GB"]);
    expect(marketplacesFor(["Berlin", "London"])).toEqual(["EBAY_GB", "EBAY_DE"]);
    expect(marketplacesFor([])).toEqual(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA"]);
    expect(marketplacesFor(["Pune"])).toEqual(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA"]);
  });
  it("shows only a seller's stated fixed price, in its own currency, with no seller name", () => {
    const r = ebayItem(eb)!;
    expect(r).toMatchObject({ company: "eBay seller", location: "United States", applyUrl: "https://www.ebay.com/itm/1", postedAt: "2026-11-01T10:00:00.000Z" });
    expect(r.attributes).toMatchObject({ price: "42.5", currency: "USD", condition: "Used", category: "Lamps" });
    expect(JSON.stringify(r)).not.toMatch(/username|feedback/);
    expect(ebayItem({ ...eb, buyingOptions: ["AUCTION"] })).toBeNull();
    expect(ebayItem({ ...eb, price: { value: "0", currency: "USD" } })).toBeNull();
    expect(ebayItem({ ...eb, itemWebUrl: "http://www.ebay.com/itm/1" })).toBeNull();
    expect(ebayItem({ ...eb, itemWebUrl: "https://evil.example/itm/1" })).toBeNull();
  });
  it("needs both credentials", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "id");
    expect(ebayAvailable()).toBe(false);
    await expect(ebaySearch(s, crit("lamp"), needs)).rejects.toThrow(/NEEDS:Source needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET/);
  });
  it("signs in once, then searches each named marketplace with the bearer token", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "app-id");
    vi.stubEnv("EBAY_CLIENT_SECRET", "cert-secret");
    const f = vi.fn(async (url: string) => (url.includes("oauth2/token") ? json({ access_token: "tok-1", expires_in: 7200 }) : json({ itemSummaries: [eb] })));
    vi.stubGlobal("fetch", f);
    expect(await ebaySearch(s, crit(""), needs)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    const jobs = await ebaySearch(s, crit("brass lamp", ["London", "Sydney"]), needs);
    // The same item id in two marketplaces is one item.
    expect(jobs).toHaveLength(1);
    await ebaySearch(s, crit("brass lamp", ["London"]), needs);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls.filter(([u]) => u.includes("oauth2/token"))).toHaveLength(1);
    const search = calls.filter(([u]) => u.includes("item_summary/search"));
    expect(search).toHaveLength(3);
    expect(search[0][0]).toContain("q=brass+lamp");
    expect(decodeURIComponent(search[0][0])).toContain("filter=buyingOptions:{FIXED_PRICE}");
    expect(search[0][1].headers).toMatchObject({ authorization: "Bearer tok-1", "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB" });
    expect(String(calls[0][1].headers && (calls[0][1].headers as Record<string, string>).authorization)).toBe(`Basic ${Buffer.from("app-id:cert-secret").toString("base64")}`);
    for (const [u] of calls) expect(u).not.toMatch(/app-id|cert-secret/);
  });
  it("answers with the marketplaces that worked, fails when all fail, and names no credential on a refusal", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "app-id");
    vi.stubEnv("EBAY_CLIENT_SECRET", "cert-secret");
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("oauth2/token") ? json({ access_token: "t", expires_in: 7200 }) : ++n === 1 ? json({}, 500) : json({ itemSummaries: [eb] }))));
    expect(await ebaySearch(s, crit("lamp", ["UK", "US"]), needs)).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("oauth2/token") ? json({ access_token: "t", expires_in: 7200 }) : json({}, 500))));
    await expect(ebaySearch(s, crit("lamp", ["UK"]), needs)).rejects.toThrow(/answered 500/);
    __resetEbayToken();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_client" }, 401)));
    const e = await ebaySearch(s, crit("lamp"), needs).then(() => new Error("did not throw"), (x: Error) => x);
    expect(e.message).toMatch(/^NEEDS:/);
    expect(e.message).not.toMatch(/app-id|cert-secret/);
  });
});

describe("the sources", () => {
  it("are listed for this module, tied to their keys, with terms pending", () => {
    const ids = MARKETPLACE_SOURCES.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["mkt_wonderworks", "mkt_flipkart", "mkt_ebay"]));
    for (const id of ["mkt_flipkart", "mkt_ebay"]) {
      const src = MARKETPLACE_SOURCES.find((x) => x.id === id)!;
      expect(src.module).toBe("marketplace");
      expect(src.statusReason).toMatch(/^terms pending:/);
      expect(src.secretRef).toMatch(/^env:/);
      expect(marketplaceSourceAvailable(src)).toBe(false);
    }
    expect(marketplaceSourceAvailable(MARKETPLACE_SOURCES[0])).toBe(true);
  });
});

describe("a foreign-currency item in Find", () => {
  const opp = (attrs: Record<string, unknown>): CanonicalOpportunity =>
    ({
      id: "m_1",
      title: "Vintage brass lamp",
      description: "Used · Lamps",
      employer: { name: "eBay seller" },
      locations: ["United States"],
      canonicalApplyUrl: "https://www.ebay.com/itm/1",
      attributes: { price: "42.50", currency: "USD", condition: "Used", category: "Lamps", ...attrs },
      sourceRecords: [{ sourceId: "mkt_ebay", sourceName: "eBay", sourceJobId: "1", canonical: true }],
    }) as unknown as CanonicalOpportunity;
  it("keeps the price as stated and never converts it", () => {
    const l = outsideListing(opp({}))!;
    expect(l.outside).toMatchObject({ currency: "USD", priceText: "$42.50", business: "eBay seller" });
    expect(l).toMatchObject({ area: "United States", terms: { condition: "Used" } });
  });
  it("maps a shop's condition words, with New only when stated or absent", () => {
    expect(outsideListing(opp({ condition: "New with tags" }))!.terms.condition).toBe("New");
    expect(outsideListing(opp({ condition: "Open box" }))!.terms.condition).toBe("Like new");
    expect(outsideListing(opp({ condition: "Certified Refurbished" }))!.terms.condition).toBe("Used");
    expect(outsideListing(opp({ condition: "" }))!.terms.condition).toBe("New");
  });
  it("takes a numeric price, and rupees need no currency text", () => {
    const l = outsideListing(opp({ price: 499, currency: "INR" }))!;
    expect(l.outside?.currency).toBeUndefined();
    expect(l.outside?.priceText).toBeUndefined();
    expect(l.terms.price).toBe(499);
  });
});
