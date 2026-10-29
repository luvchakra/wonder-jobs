import { describe, expect, it } from "vitest";
import { MODULES } from "@/modules/registry";
import { STATE_STORES } from "./state";

describe("module store documents", () => {
  it("every live module other than Jobs syncs its own store", () => {
    for (const m of MODULES.filter((x) => x.status === "live" && x.id !== "jobs")) expect(STATE_STORES).toContain(`wj.m.${m.id}`);
  });
});
