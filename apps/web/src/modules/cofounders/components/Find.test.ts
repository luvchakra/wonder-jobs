import { describe, expect, it } from "vitest";
import { refineCofounders } from "./Find";
import type { CofounderListing } from "../domain";

const l = (id: string, kind: CofounderListing["kind"]): CofounderListing => ({ id, kind, title: id, company: "", location: "", terms: {}, description: "", sourceId: "s", sourceName: "s" });
const all = [l("a", "person"), l("b", "team"), l("c", "post"), l("d", "startup")];

describe("Co-founders Refine → kind", () => {
  it("Any (the default) keeps every kind, New startups included, and hides nothing", () => {
    expect(refineCofounders(all, {}, "relevance")).toMatchObject({ hidden: 0 });
    expect(refineCofounders(all, {}, "relevance").kept.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("choosing a kind narrows to just that kind", () => {
    for (const [kind, id] of [["person", "a"], ["team", "b"], ["post", "c"], ["startup", "d"]] as const) expect(refineCofounders(all, { kind }, "relevance").kept.map((x) => x.id)).toEqual([id]);
  });
});
