import { describe, expect, it } from "vitest";
import { parseExploriumRatings } from "@/domain/jobslake/ratings";
import { companyBrief, companyLines } from "@/domain/jobslake/companies";
import { __MemoryCompanies, companyBriefs } from "./companies";
import { exploriumRatings } from "./explorium";
import { __MemoryRatingKeys } from "./ratingKeys";
import { runRatings } from "./ratingsJob";

const NOW = Date.parse("2026-10-24T00:00:00Z");
const co = (domain: string, name = domain) => ({ domain, name, nameKey: name.toLowerCase(), sources: ["greenhouse"], firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-10-24T00:00:00Z" });

/** A pretend Explorium: each key has a balance; a ratings call spends one credit per company it matches ("fig*" and "str*" match). */
function explorium(balances: Record<string, number>, opts: { rateLimit?: boolean } = {}) {
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const key = (init?.headers as Record<string, string>).api_key;
    calls.push(`${url.endsWith("/v2/credits") ? "credits" : "enrich"}:${key}`);
    if (!(key in balances)) return new Response("{}", { status: 401 });
    if (url.endsWith("/v2/credits")) return Response.json({ remaining_credits: balances[key] });
    if (opts.rateLimit) return new Response("{}", { status: 429 });
    const asked = (JSON.parse(String(init?.body)) as { businesses_to_match: { domain: string }[] }).businesses_to_match;
    const hits = asked.filter((a) => /^(fig|str)/.test(a.domain));
    if (hits.length > balances[key]) return new Response("{}", { status: 402 });
    balances[key] -= hits.length;
    return Response.json({ data: asked.map((a) => (/^(fig|str)/.test(a.domain) ? { input: { domain: a.domain }, business_id: "b".repeat(32), data: { ratings_overall: 4.14, total_reviews_count: 321, ratings_work_life_balance: 3.9 } } : { input: { domain: a.domain }, business_id: null, data: null })) });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("Explorium ratings", () => {
  it("reads only ratings it can trust: overall 1–5, the category ratings, the review count", () => {
    expect(parseExploriumRatings({ ratings_overall: 4.14, total_reviews_count: 321, ratings_work_life_balance: 3.9, ratings_cutlure_values: 4.6, ratings_senior_management: 9 })).toEqual({ overall: 4.1, reviews: 321, categories: { workLife: 3.9, culture: 4.6 }, from: "Explorium" });
    expect(parseExploriumRatings({ ratings_overall: 0 })).toBeUndefined();
    expect(parseExploriumRatings(null)).toBeUndefined();
  });

  it("tells a spent key (402), a refused key (401) and a rate limit (429) apart from a real answer", async () => {
    const answer = (status: number) => (async () => new Response("{}", { status })) as unknown as typeof fetch;
    expect((await exploriumRatings("k", [{ domain: "a.com", name: "A" }], answer(402))).kind).toBe("exhausted");
    expect((await exploriumRatings("k", [{ domain: "a.com", name: "A" }], answer(401))).kind).toBe("rejected");
    expect((await exploriumRatings("k", [{ domain: "a.com", name: "A" }], answer(429))).kind).toBe("limited");
    expect((await exploriumRatings("k", [{ domain: "a.com", name: "A" }], answer(500))).kind).toBe("error");
  });
});

describe("the ratings job", () => {
  async function setup(domains: string[], keys: string[]) {
    const companies = new __MemoryCompanies();
    await companies.upsert(domains.map((d) => co(d)));
    const store = new __MemoryRatingKeys();
    for (const k of keys) await store.add(k, k.slice(-3));
    return { companies, store };
  }

  it("spends the first key, deletes it when it runs out, and carries on with the next until everything is covered", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com", "other.com"], ["key-first-111", "key-second-222"]);
    const x = explorium({ "key-first-111": 2, "key-second-222": 50 });
    const retired: string[] = [];
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW, onRetire: async (k) => void retired.push(k.reason) });
    expect(r).toMatchObject({ status: "complete", checked: 4, rated: 3, notFound: 1, left: 0, keysLeft: 1, message: "All companies are covered — no company left." });
    expect(r.retired.map((k) => k.reason)).toEqual(["out of credits"]);
    expect(retired).toEqual(["out of credits"]);
    // The spent key is gone from the list; the unspent one stays.
    expect((await store.list()).map((k) => k.label)).toEqual(["222"]);
    // Listing a key never gives the secret back, only its mask.
    expect(JSON.stringify([...(await store.list()), r])).not.toMatch(/key-first-111|key-second-222|ciphertext/);
    expect(companies.rows.get("fig1.com")?.ratings).toMatchObject({ overall: 4.1, reviews: 321 });
    // Looked up, none found: recorded as looked up so it isn't asked for again for 90 days.
    expect(companies.rows.get("other.com")).toMatchObject({ ratings: null, ratingsAt: expect.any(String) });
  });

  it("when the last key is spent with companies left, says how many and asks for a new key", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com"], ["key-only-111"]);
    const x = explorium({ "key-only-111": 2 });
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW });
    expect(r).toMatchObject({ status: "needs_key", checked: 2, left: 1, keysLeft: 0, message: "1 company is still left. Add a new API key to continue." });
    expect(await store.list()).toEqual([]);
    // A new key later finishes the job.
    await store.add("key-new-333", "new");
    const again = await runRatings({ companies, keys: store, fetcher: explorium({ "key-new-333": 10 }).f, now: NOW });
    expect(again.status).toBe("complete");
  });

  it("deletes a key Explorium refuses, keeps a key that is only rate limited, and with no keys says so", async () => {
    const a = await setup(["fig1.com"], ["key-bad-111", "key-good-222"]);
    const r = await runRatings({ companies: a.companies, keys: a.store, fetcher: explorium({ "key-good-222": 5 }).f, now: NOW });
    expect(r.retired.map((k) => k.reason)).toEqual(["refused by Explorium"]);
    expect(r.status).toBe("complete");

    const b = await setup(["fig1.com"], ["key-ok-111"]);
    const limited = await runRatings({ companies: b.companies, keys: b.store, fetcher: explorium({ "key-ok-111": 5 }, { rateLimit: true }).f, now: NOW });
    expect(limited.status).toBe("stopped");
    expect((await b.store.list()).length).toBe(1);

    const c = await setup(["fig1.com"], []);
    expect((await runRatings({ companies: c.companies, keys: c.store, now: NOW })).status).toBe("needs_key");
  });

  it("never asks for more companies than the key has credits, and shows a rating with its source and date", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com"], ["key-small-111"]);
    const x = explorium({ "key-small-111": 2 });
    await runRatings({ companies, keys: store, fetcher: x.f, now: NOW });
    expect(x.calls.filter((c) => c.startsWith("enrich")).length).toBe(1);
    const rated = [...companies.rows.values()].find((r) => r.ratings)!;
    const lines = companyLines({ name: rated.name, ratings: rated.ratings!, ratingsAt: rated.ratingsAt });
    expect(lines).toEqual([{ label: "Rating", value: "4.1 out of 5 · 321 reviews", source: expect.stringMatching(/^Explorium employee reviews, \w{3} 20\d\d$/), stars: 4.1, detail: "Work-life 3.9" }]);
    // The rating leads the Company section, ahead of the other facts.
    expect(companyLines({ name: "X", ratings: rated.ratings!, wikidata: { founded: 2012, from: "Wikidata" } as never }).map((l) => l.label)).toEqual(["Rating", "Founded"]);
    expect(companyBrief({ name: "", ratings: rated.ratings!, ratingsAt: rated.ratingsAt }).rating).toMatchObject({ value: 4.1, reviews: 321 });
    expect((await companyBriefs([{ d: rated.domain, n: rated.name }], companies))[rated.domain]?.rating?.value).toBe(4.1);
  });
});
