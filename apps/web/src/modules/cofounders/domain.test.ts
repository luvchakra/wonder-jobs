import { describe, expect, it } from "vitest";
import { applyFacets, bothAgree, cleanProfile, cleanTeam, matchListing, sideAgrees, sideOf, teamMay, viewProfile, type CofounderListing, type ConnShape } from "./domain";

const P = { name: "Asha Rao", headline: "Backend engineer, ex-fintech", role: "Tech", skills: ["Engineering", "Data / AI"], commitment: "Full time", location: "Pune", ideaState: "idea", idea: "Invoices that chase themselves for small shops", about: "Ten years of payments.", lookingFor: "A sales-minded partner", equity: "Equal split", open: true };

describe("a profile shows only what its owner chose", () => {
  const p = cleanProfile(P);
  if (!("value" in p)) throw new Error(p.problem);
  it("the public view has the headline and the everyone-tier fields; never the name or a hidden field", () => {
    const v = viewProfile(p.value, "public");
    expect(v).toEqual({ headline: P.headline, role: "Tech", skills: P.skills, commitment: "Full time" });
    expect(JSON.stringify(v)).not.toContain("Asha");
    expect(JSON.stringify(v)).not.toContain("Pune");
  });
  it("a mutual connection also sees the name and the connections tier; a field set to Only me stays hidden", () => {
    const hidden = cleanProfile({ ...P, tiers: { equity: "hidden", about: "everyone" } });
    if (!("value" in hidden)) throw new Error(hidden.problem);
    const v = viewProfile(hidden.value, "mutual");
    expect(v.name).toBe("Asha Rao");
    expect(v.about).toBe(P.about);
    expect(v.lookingFor).toBe(P.lookingFor);
    expect(v.equity).toBeUndefined();
    expect(viewProfile(hidden.value, "public").about).toBe(P.about);
  });
  it("asks for what is missing, in words", () => {
    expect(cleanProfile({ ...P, name: "" })).toHaveProperty("problem");
    expect(cleanProfile({ ...P, headline: "x" })).toHaveProperty("problem");
    expect(cleanProfile({ ...P, role: "Other" })).toHaveProperty("problem");
    expect(cleanProfile({ ...P, skills: [] })).toHaveProperty("problem");
    expect(cleanProfile({ ...P, ideaState: "idea", idea: "" })).toHaveProperty("problem");
  });
});

describe("a team", () => {
  const T = { name: "Chaser", idea: "Invoices that chase themselves", stage: "Prototype", openRoles: [{ role: "Business", skills: ["Sales"] }], decision: "all", open: true };
  it("can be listed only with an open role", () => {
    expect(cleanTeam(T)).toMatchObject({ value: { decision: "all", openRoles: [{ role: "Business", skills: ["Sales"] }] } });
    expect(cleanTeam({ ...T, openRoles: [] })).toHaveProperty("problem");
    expect(cleanTeam({ ...T, openRoles: [], open: false })).toHaveProperty("value");
  });
  it("only a founder runs it; a member can message and leave; an unknown role can do nothing", () => {
    for (const a of ["edit", "invite", "decide", "close"] as const) {
      expect(teamMay("founder", a)).toBe(true);
      expect(teamMay("member", a)).toBe(false);
    }
    expect(teamMay("member", "message")).toBe(true);
    expect(teamMay("member", "leave")).toBe(true);
    expect(teamMay("owner", "view")).toBe(false);
    expect(teamMay(undefined, "view")).toBe(false);
  });
});

describe("agreement between two sides", () => {
  const join: ConnShape = { kind: "join", initiator: "p1", person: "p1" };
  const founders = ["f1", "f2", "f3"];
  it("a team under 'any' accepts when one founder does; under 'all' only when every founder does", () => {
    expect(bothAgree(join, founders, "any", ["p1", "f2"])).toBe(true);
    expect(bothAgree(join, founders, "all", ["p1", "f2"])).toBe(false);
    expect(bothAgree(join, founders, "all", ["p1", "f1", "f2", "f3"])).toBe(true);
    expect(bothAgree(join, founders, "any", ["f1"])).toBe(false);
  });
  it("a pair needs both people", () => {
    const pair: ConnShape = { kind: "pair", initiator: "a", person: "a", other: "b" };
    expect(bothAgree(pair, [], "any", ["a"])).toBe(false);
    expect(bothAgree(pair, [], "any", ["a", "b"])).toBe(true);
    expect(sideAgrees({ tenants: [], rule: "all" }, [])).toBe(false);
  });
  it("a stranger stands on neither side", () => {
    expect(sideOf(join, founders, "p1")).toBe(0);
    expect(sideOf(join, founders, "f2")).toBe(1);
    expect(sideOf(join, founders, "x")).toBeNull();
  });
});

describe("Refine and fit", () => {
  const person: CofounderListing = { id: "cfp_1", kind: "person", title: "Backend", company: "Founder", location: "", terms: { role: "Tech", skills: ["Engineering"], commitment: "Full time" }, description: "", sourceId: "cof", sourceName: "WonderWorks" };
  const team: CofounderListing = { id: "cft_1", kind: "team", title: "Chaser", company: "x", location: "", terms: { openRoles: [{ role: "Business", skills: ["Sales"] }], commitment: "Part time", idea: "x" }, description: "", sourceId: "cof", sourceName: "WonderWorks" };
  it("filters by kind, role (a team's open roles), skill and commitment", () => {
    expect(applyFacets([person, team], { kind: "team" }).kept).toEqual([team]);
    expect(applyFacets([person, team], { role: "Business" }).kept).toEqual([team]);
    expect(applyFacets([person, team], { skill: "engineering" }).kept).toEqual([person]);
    expect(applyFacets([person, team], { commitment: "Full time" })).toEqual({ kept: [person], hidden: 1 });
  });
  it("a Tech founder fits a person who is Business and a team that needs Tech", () => {
    const me = { role: "Tech" as const, skills: [], commitment: "Full time" as const };
    expect(matchListing({ ...person, terms: { role: "Business", commitment: "Full time" } }, me).fit).toBe("strong");
    expect(matchListing(team, me).fit).toBe("some");
    expect(matchListing(person, null).fit).toBe("unknown");
  });
});
