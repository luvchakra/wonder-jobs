import { describe, expect, it, vi } from "vitest";

describe("the gateway bridge sources", () => {
  it("Scholarships keeps a listing that names no provider, as \"Provider not stated\"; other modules still need an employer", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_ENABLED", "1");
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "https://gateway.example.org");
    vi.resetModules();
    const { GATEWAY_SOURCES } = await import("./gatewaySources");
    const { NO_PROVIDER } = await import("@/server/scholarships/sources");
    const mapping = (m: string) => {
      const s = GATEWAY_SOURCES.find((x) => x.module === m);
      return s?.config.kind === "json_api" ? s.config.api.mapping : undefined;
    };
    expect(mapping("scholarships")?.defaultEmployer).toBe(NO_PROVIDER);
    expect(mapping("jobs")?.defaultEmployer).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
