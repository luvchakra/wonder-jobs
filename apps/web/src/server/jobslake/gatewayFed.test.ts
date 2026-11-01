import { describe, expect, it } from "vitest";
import { gatewayFed } from "./core";
import { SERVICES_SOURCES } from "@/server/services/sources";
import type { SourceRecord } from "./types";

describe("built-in sources that only read the data gateway", () => {
  it("are recognised, so their failed test says how to set them up instead of 'returned nothing'", () => {
    const fed = SERVICES_SOURCES.filter(gatewayFed).map((s) => s.name);
    expect(fed).toEqual(expect.arrayContaining(["OpenStreetMap"]));
    expect(fed).not.toContain("WonderWorks pros");
  });
  it("never applies to an admin-added source", () => {
    expect(gatewayFed({ builtin: false, description: "via the data gateway" } as SourceRecord)).toBe(false);
  });
});
