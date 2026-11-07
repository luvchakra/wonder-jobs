import { describe, expect, it } from "vitest";
import { nameVariants, resolveCompanyByName } from "./companies";

describe("finding an organisation by name on Wikidata (owner, 2026-11-07: IIT Madras had no logo)", () => {
  it("tries the name without its spelled-in acronym, and as acronym + the rest", () => {
    expect(nameVariants("indian institute of technology iit madras")).toEqual(["indian institute of technology iit madras", "indian institute of technology madras", "iit madras"]);
    expect(nameVariants("acme")).toEqual(["acme"]);
    expect(nameVariants("ministry of tribal affairs government of india")).toEqual(["ministry of tribal affairs government of india", "ministry of tribal affairs"]);
    expect(nameVariants("tata consultancy services")).toEqual(["tata consultancy services"]);
  });

  it("finds it through a variant, accepting a hit whose label or matched alias is that exact name, and takes its official website", async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      const u = new URL(url);
      if (u.searchParams.get("action") === "wbsearchentities") {
        const q = u.searchParams.get("search");
        const search = q === "indian institute of technology madras" ? [{ id: "Q858662", label: "Indian Institute of Technology Madras", match: { type: "label", text: "Indian Institute of Technology Madras" } }] : [];
        return new Response(JSON.stringify({ search }), { status: 200 });
      }
      return new Response(JSON.stringify({ entities: { Q858662: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q3918" } } } }], P856: [{ mainsnak: { datavalue: { value: "https://www.iitm.ac.in/" } } }] } } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await resolveCompanyByName("indian institute of technology iit madras", fake, 1);
    expect(r).toEqual({ domain: "iitm.ac.in", name: "Indian Institute of Technology Madras", wikidataId: "Q858662" });
    expect(asked.filter((a) => a.includes("wbsearchentities"))).toHaveLength(2);
  });

  it("accepts an alias match (\"IIT Madras\") but never a different name", async () => {
    const fake = (async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("action") === "wbsearchentities") return new Response(JSON.stringify({ search: [{ id: "Q1", label: "Something Else Entirely", match: { type: "alias", text: "Zeta Labs" } }] }), { status: 200 });
      return new Response(JSON.stringify({ entities: { Q1: { claims: { P856: [{ mainsnak: { datavalue: { value: "https://www.zetalabs.io" } } }] } } } }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await resolveCompanyByName("zeta labs", fake, 2))?.domain).toBe("zetalabs.io");
    expect(await resolveCompanyByName("omega labs", fake, 3)).toBeUndefined();
  });
});
