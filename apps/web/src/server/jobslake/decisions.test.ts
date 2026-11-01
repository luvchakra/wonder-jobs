import { describe, expect, it } from "vitest";
import { decisionsDone, OWNER_DECISIONS, setDecision } from "./decisions";
import { MODULES } from "@/modules/registry";

describe("owner decisions on Setup to-do", () => {
  it("are unique, name a real module (or all), and say what to decide", () => {
    const ids = OWNER_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of OWNER_DECISIONS) {
      expect(d.module === "all" || MODULES.some((m) => m.id === d.module)).toBe(true);
      expect(d.detail.length).toBeGreaterThan(20);
    }
  });

  it("marks one done and back, refuses unknown ids, and keeps who and when", async () => {
    const id = OWNER_DECISIONS[0].id;
    expect(await setDecision("nope", true, "admin@x")).toBe(false);
    expect(await setDecision(id, true, "admin@x", " chose self-hosted ", new Date("2026-11-01T10:00:00Z"))).toBe(true);
    expect((await decisionsDone())[id]).toEqual({ at: "2026-11-01T10:00:00.000Z", by: "admin@x", note: "chose self-hosted" });
    await setDecision(id, false, "admin@x");
    expect(id in (await decisionsDone())).toBe(false);
  });
});
