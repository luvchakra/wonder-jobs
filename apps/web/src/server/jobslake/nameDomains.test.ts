import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryCompanies } from "./companies";
import { NAME_TTL_MS, resolveNameDomains } from "./nameDomains";
import { wikidataWebsites } from "./wikidata";

const opp = (name: string) => ({ employer: { name }, canonicalApplyUrl: "https://in.indeed.com/1", applyPath: "platform", quality: { employerVerified: false }, sourceRecords: [], postedAt: "2026-10-23T00:00:00Z" }) as unknown as CanonicalOpportunity;
const at = "2026-10-24T00:00:00Z";

describe("names without a domain", () => {
  it("remembers a name Wikidata couldn't answer for, and asks again only after the TTL", async () => {
    const store = new __MemoryCompanies();
    let saved: Record<string, string> = {};
    const memory = { read: async () => ({ ...saved }), write: async (x: Record<string, string>) => void (saved = x) };
    let calls = 0;
    const lookup = (async () => (calls++, new Map())) as unknown as typeof wikidataWebsites;
    await resolveNameDomains([opp("Nobody Ltd")], { store, at, lookup, memory });
    expect(saved).toEqual({ nobody: at });
    await resolveNameDomains([opp("Nobody Ltd")], { store, at: "2026-10-30T00:00:00Z", lookup, memory });
    expect(calls).toBe(1);
    await resolveNameDomains([opp("Nobody Ltd")], { store, at: new Date(Date.parse(at) + NAME_TTL_MS + 1000).toISOString(), lookup, memory });
    expect(calls).toBe(2);
  });

  it("leaves a name unmarked when Wikidata refuses, so the next run asks again", async () => {
    let saved: Record<string, string> = {};
    const memory = { read: async () => ({ ...saved }), write: async (x: Record<string, string>) => void (saved = x) };
    const lookup = (async () => { throw new Error("429"); }) as unknown as typeof wikidataWebsites;
    const r = await resolveNameDomains([opp("Acme")], { store: new __MemoryCompanies(), at, lookup, memory });
    expect(r).toMatchObject({ asked: 1, resolved: 0 });
    expect(saved).toEqual({});
  });
});

describe("wikidataWebsites", () => {
  const answer = (rows: object[]) => (async () => new Response(JSON.stringify({ results: { bindings: rows } }), { status: 200 })) as unknown as typeof fetch;
  const row = (label: string, item: string, site: string) => ({ label: { value: label }, item: { value: `http://www.wikidata.org/entity/${item}` }, site: { value: site } });

  it("takes one item with one website, and refuses ambiguous names and hiring platforms", async () => {
    const out = await wikidataWebsites(["HSBC", "Twin", "Board Co", "Two Sites"], answer([
      row("HSBC", "Q1", "https://www.hsbc.com/"),
      row("Twin", "Q2", "https://twin.com"), row("Twin", "Q3", "https://twin.org"),
      row("Board Co", "Q4", "https://www.indeed.com/cmp/board"),
      row("Two Sites", "Q5", "https://a.com"), row("Two Sites", "Q5", "https://b.com"),
    ]));
    expect([...out]).toEqual([["hsbc", { domain: "hsbc.com", sourceId: "Q1" }]]);
  });

  it("matches a label only when it is the company's name", async () => {
    const out = await wikidataWebsites(["Altera Semiconductor"], answer([row("Altera", "Q9", "https://altera.com")]));
    expect(out.size).toBe(0);
  });
});
