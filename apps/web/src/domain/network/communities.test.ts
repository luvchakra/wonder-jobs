import { describe, expect, it } from "vitest";
import { cleanCommunity, layOut, MAX_DEPTH } from "./communities";

type R = { id: string; parentId: string | null; at: string };
const r = (id: string, parentId: string | null, at: string): R => ({ id, parentId, at });
const byTime = (a: R, b: R) => a.at.localeCompare(b.at);

describe("laying out a long reply tree", () => {
  it("reading order is each reply then its answers; depth stops at MAX_DEPTH and says who it answers", () => {
    const chain = Array.from({ length: MAX_DEPTH + 3 }, (_, i) => r(`r${i}`, i ? `r${i - 1}` : null, `2026-11-22T10:0${i}`));
    const laid = layOut([...chain].reverse(), byTime);
    expect(laid.map((l) => l.reply.id)).toEqual(chain.map((c) => c.id));
    expect(laid.map((l) => l.depth)).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(laid.slice(0, MAX_DEPTH + 1).every((l) => !l.replyingTo)).toBe(true);
    expect(laid[MAX_DEPTH + 1].replyingTo).toBe(`r${MAX_DEPTH}`);
    expect(laid[0].descendants).toBe(chain.length - 1);
  });

  it("siblings follow the order given; a reply whose parent is gone hangs off the discussion", () => {
    const list = [r("a", null, "1"), r("b", null, "2"), r("a1", "a", "3"), r("orphan", "deleted-for-good", "4")];
    expect(layOut(list, byTime).map((l) => [l.reply.id, l.depth])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["b", 0],
      ["orphan", 0],
    ]);
    expect(layOut(list, (x, y) => y.at.localeCompare(x.at)).map((l) => l.reply.id)).toEqual(["orphan", "b", "a", "a1"]);
  });
});

describe("a community's settings", () => {
  it("are trimmed; Private and Moderators approve only when chosen (the route accepts nothing else)", () => {
    expect(cleanCommunity({ name: "  Bank   CISOs ", about: "x\n\n\n\ny", visibility: "private", joinPolicy: "approval" })).toEqual({ name: "Bank CISOs", about: "x\n\ny", rules: "", visibility: "private", joinPolicy: "approval" });
    expect(cleanCommunity({ name: "A", visibility: "weird" as never, joinPolicy: "weird" as never })).toMatchObject({ visibility: "public", joinPolicy: "open" });
  });
});
