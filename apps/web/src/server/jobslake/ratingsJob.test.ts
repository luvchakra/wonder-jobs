import { describe, expect, it } from "vitest";
import { parseExploriumRatings } from "@/domain/jobslake/ratings";
import { companyBrief, companyLines } from "@/domain/jobslake/companies";
import { __MemoryCompanies, companyBriefs } from "./companies";
import { exploriumRatings } from "./explorium";
import { __MemoryRatingKeys } from "./ratingKeys";
import { runRatings } from "./ratingsJob";

const NOW = Date.parse("2026-10-24T00:00:00Z");
const co = (domain: string, name = domain) => ({ domain, name, nameKey: name.toLowerCase(), sources: ["greenhouse"], firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-10-24T00:00:00Z" });

/**
 * A pretend Explorium, as the real one behaved: each key has a balance, a matched company costs 2 credits ("fig*" and
 * "str*" match, others are free), and a request that costs more than the balance is refused with 403.
 */
function explorium(balances: Record<string, number>, opts: { rateLimit?: boolean; maxPerCall?: number; cost?: number } = {}) {
  const cost = opts.cost ?? 2;
  const calls: { kind: string; size?: number }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const key = (init?.headers as Record<string, string>).api_key;
    if (!(key in balances)) return new Response("{}", { status: 401 });
    if (url.endsWith("/v2/credits")) {
      calls.push({ kind: "credits" });
      return Response.json({ remaining_credits: balances[key] });
    }
    const asked = (JSON.parse(String(init?.body)) as { businesses_to_match: { domain: string }[] }).businesses_to_match;
    calls.push({ kind: "enrich", size: asked.length });
    if (opts.rateLimit) return new Response("{}", { status: 429 });
    const hits = asked.filter((a) => /^(fig|str)/.test(a.domain));
    if (hits.length * cost > balances[key] || asked.length > (opts.maxPerCall ?? 50)) return new Response("{}", { status: 403 });
    balances[key] -= hits.length * cost;
    const matched = hits.length;
    return Response.json({ credit_usage: { total_credits: matched * cost, total_results: matched }, data: asked.map((a) => (/^(fig|str)/.test(a.domain) ? { input: { domain: a.domain }, business_id: "b".repeat(32), data: { ratings_overall: 4.14, total_reviews_count: 321, ratings_work_life_balance: 3.9, ratings_ceo_approval: 0.93, ratings_ceo_approval_count: 116, ratings_recommend_to_friend: 0.79, ratings_business_outlook: 0.79, ratings_culture_values: null } } : { input: { domain: a.domain }, business_id: null, data: null })) });
  }) as unknown as typeof fetch;
  return { f, calls, balances };
}

describe("Explorium ratings", () => {
  it("reads only ratings it can trust: overall 1–5, the category ratings, the review count, the shares of reviewers", () => {
    expect(parseExploriumRatings({ ratings_overall: 4.14, total_reviews_count: 321, ratings_work_life_balance: 3.9, ratings_cutlure_values: 4.6, ratings_senior_management: 9 })).toEqual({ overall: 4.1, reviews: 321, categories: { workLife: 3.9, culture: 4.6 }, from: "Explorium" });
    // Figma's real answer from Explorium: shares are fractions, floats carry noise, culture is null (no rating, not a bug).
    expect(parseExploriumRatings({ ratings_all_reviews_count: 203, ratings_business_outlook: 0.7900000214576721, ratings_career_opportunities: 3.5999999046325684, ratings_ceo_approval: 0.9300000071525574, ratings_ceo_approval_count: 116, ratings_compensation_benefits: 4, ratings_culture_values: null, ratings_diversity_inclusion: 4.199999809265137, ratings_overall: 4.099999904632568, ratings_recommend_to_friend: 0.7900000214576721, ratings_senior_management: 3.4000000953674316, ratings_work_life_balance: 3.200000047683716, total_reviews_count: 203, company_score: null })).toEqual({ overall: 4.1, reviews: 203, ceoApproval: 93, ceoVotes: 116, recommend: 79, outlook: 79, categories: { workLife: 3.2, compensation: 4, career: 3.6, management: 3.4, diversity: 4.2 }, from: "Explorium" });
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

  it("spends the first key, deletes it when it can't pay for another company, and carries on with the next until everything is covered", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com", "other.com"], ["key-first-111", "key-second-222"]);
    const x = explorium({ "key-first-111": 5, "key-second-222": 100 });
    const retired: string[] = [];
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW, onRetire: async (k) => void retired.push(k.reason) });
    expect(r).toMatchObject({ status: "complete", checked: 4, rated: 3, notFound: 1, left: 0, keysLeft: 1, message: "All companies are covered — no company left." });
    expect(r.retired).toEqual([{ masked: expect.any(String), label: "111", reason: "too few credits left for another company", creditsLeft: 1 }]);
    expect(retired).toEqual(["too few credits left for another company"]);
    // The spent key is gone from the list; the unspent one stays.
    expect((await store.list()).map((k) => k.label)).toEqual(["222"]);
    // Listing a key never gives the secret back, only its mask.
    expect(JSON.stringify([...(await store.list()), r])).not.toMatch(/key-first-111|key-second-222|ciphertext/);
    expect(companies.rows.get("fig1.com")?.ratings).toMatchObject({ overall: 4.1, reviews: 321 });
    // Looked up, none found: recorded as looked up so it isn't asked for again for 90 days.
    expect(companies.rows.get("other.com")).toMatchObject({ ratings: null, ratingsAt: expect.any(String) });
  });

  it("measures what a company costs and never asks for more than the credits can pay — the key isn't deleted while it has credits for a company", async () => {
    // The owner's first run: 100 credits, a matched company costs 2. 34 credits left must buy 17 companies' worth, not be refused.
    const many = Array.from({ length: 100 }, (_, i) => `fig${i}.com`);
    const { companies, store } = await setup(many, ["key-only-111"]);
    const x = explorium({ "key-only-111": 34 });
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW });
    expect(r.status).toBe("needs_key");
    expect(r.rated).toBe(17);
    expect(x.balances["key-only-111"]).toBe(0);
    expect(r.retired).toEqual([{ masked: expect.any(String), label: "111", reason: "out of credits", creditsLeft: 0 }]);
    expect(r.message).toBe("83 companies are still left. Add a new API key to continue.");
    expect(await store.list()).toEqual([]);
    // A new key later finishes the job.
    await store.add("key-new-333", "new");
    const again = await runRatings({ companies, keys: store, fetcher: explorium({ "key-new-333": 1000 }).f, now: NOW });
    expect(again.status).toBe("complete");
  });

  it("carries on, and says so, when Explorium prices a company above 2 credits — it goes by Explorium's own credit_usage, not by the balance", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com", "fig4.com", "fig5.com", "fig6.com"], ["key-pricey-111"]);
    const x = explorium({ "key-pricey-111": 100 }, { cost: 3, maxPerCall: 2 });
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW });
    expect(r.status).toBe("complete");
    expect(r.rated).toBe(6);
    expect(r.notes).toEqual(["Explorium charged 3 credits per company on a batch, above the 2 expected."]);
    expect(x.balances["key-pricey-111"]).toBe(100 - 6 * 3);
  });

  it("does not mistake other use of the Explorium account for a higher price", async () => {
    // The owner's real case: 100 credits, 27 rated for 54, and 4 more credits used elsewhere on the account.
    const { companies, store } = await setup(Array.from({ length: 27 }, (_, i) => `fig${i}.com`).concat(["x1.com", "x2.com"]), ["key-shared-111"]);
    const x = explorium({ "key-shared-111": 100 });
    let first = true;
    const f = (async (url: string, init?: RequestInit) => {
      const res = await x.f(url, init);
      if (!url.endsWith("/v2/credits") && first) {
        first = false;
        x.balances["key-shared-111"] -= 4;
      }
      return res;
    }) as unknown as typeof fetch;
    const r = await runRatings({ companies, keys: store, fetcher: f, now: NOW });
    expect(r.status).toBe("complete");
    expect(r.notes).toEqual([]);
  });

  it("when Explorium refuses a batch the key can still pay for, tries a smaller one instead of deleting the key", async () => {
    const { companies, store } = await setup(["fig1.com", "fig2.com", "fig3.com", "fig4.com", "fig5.com"], ["key-ok-111"]);
    const x = explorium({ "key-ok-111": 100 }, { maxPerCall: 2 });
    const r = await runRatings({ companies, keys: store, fetcher: x.f, now: NOW });
    expect(r).toMatchObject({ status: "complete", checked: 5, rated: 5, retired: [], keysLeft: 1 });
    // Five were asked for and refused, so it asked for two, and went on from there.
    expect(x.calls.filter((c) => c.kind === "enrich").map((c) => c.size).slice(0, 2)).toEqual([5, 2]);
  });

  it("deletes a key Explorium rejects, keeps a key that is only rate limited, and with no keys says so", async () => {
    const a = await setup(["fig1.com"], ["key-bad-111", "key-good-222"]);
    const r = await runRatings({ companies: a.companies, keys: a.store, fetcher: explorium({ "key-good-222": 50 }).f, now: NOW });
    expect(r.retired.map((k) => k.reason)).toEqual(["refused by Explorium"]);
    expect(r.status).toBe("complete");

    const b = await setup(["fig1.com"], ["key-ok-111"]);
    const limited = await runRatings({ companies: b.companies, keys: b.store, fetcher: explorium({ "key-ok-111": 50 }, { rateLimit: true }).f, now: NOW });
    expect(limited.status).toBe("stopped");
    expect((await b.store.list()).length).toBe(1);

    const c = await setup(["fig1.com"], []);
    expect((await runRatings({ companies: c.companies, keys: c.store, now: NOW })).status).toBe("needs_key");
  });

  it("shows a rating with its source and date", async () => {
    const { companies, store } = await setup(["fig1.com"], ["key-small-111"]);
    await runRatings({ companies, keys: store, fetcher: explorium({ "key-small-111": 20 }).f, now: NOW });
    const rated = [...companies.rows.values()].find((r) => r.ratings)!;
    const lines = companyLines({ name: rated.name, ratings: rated.ratings!, ratingsAt: rated.ratingsAt });
    expect(lines).toEqual([{ label: "Rating", value: "4.1 out of 5 · 321 reviews", source: expect.stringMatching(/^Explorium employee reviews, \w{3} 20\d\d$/), stars: 4.1, details: ["Work-life 3.9", "CEO approval 93% (116 votes) · Would recommend 79% · Positive outlook 79%"] }]);
    // The rating leads the Company section, ahead of the other facts.
    expect(companyLines({ name: "X", ratings: rated.ratings!, wikidata: { founded: 2012, from: "Wikidata" } as never }).map((l) => l.label)).toEqual(["Rating", "Founded"]);
    expect(companyBrief({ name: "", ratings: rated.ratings!, ratingsAt: rated.ratingsAt }).rating).toMatchObject({ value: 4.1, reviews: 321 });
    expect((await companyBriefs([{ d: rated.domain, n: rated.name }], companies))[rated.domain]?.rating?.value).toBe(4.1);
  });
});
