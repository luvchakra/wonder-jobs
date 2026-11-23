import { describe, expect, it } from "vitest";
import { networkModeFor } from "./networkMode";

describe("networkModeFor", () => {
  it("is network mode on Network's own pages, whatever came before", () => {
    expect(networkModeFor("/app/network", false)).toBe(true);
    expect(networkModeFor("/app/network/communities/c1", false)).toBe(true);
  });
  it("is never network mode on a module's pages", () => {
    expect(networkModeFor("/app/m/events", true)).toBe(false);
    expect(networkModeFor("/app/jobs", true)).toBe(false);
  });
  it("keeps the mode the member came from on Messages", () => {
    expect(networkModeFor("/app/network/messages", false)).toBe(false);
    expect(networkModeFor("/app/network/messages/abc", false)).toBe(false);
    expect(networkModeFor("/app/network/messages", true)).toBe(true);
  });
});
