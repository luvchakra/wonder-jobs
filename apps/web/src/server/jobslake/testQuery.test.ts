import { describe, expect, it } from "vitest";
import { TEST_QUERY } from "./core";
import { MODULE_IDS } from "@/wonderworks/manifest";

describe("a source's Test has a fallback word for every module (2026-11-05: Jooble answered 400 to an empty search)", () => {
  it("names a plain word for each module", () => {
    for (const m of MODULE_IDS) expect(TEST_QUERY[m]).toMatch(/^[a-z]+$/);
  });
});
