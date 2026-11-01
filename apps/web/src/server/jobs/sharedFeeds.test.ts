import { afterEach, describe, expect, it, vi } from "vitest";
import { SOURCE_FETCHERS } from "./providers";
import { BUILTIN_SOURCES } from "@/server/jobslake/registry";

afterEach(() => vi.unstubAllEnvs());

describe("Jobs' USAJOBS and Jooble sources (WJ-545)", () => {
  it("say Needs setup until the platform has their keys, and are asked once they do", () => {
    expect(SOURCE_FETCHERS.usajobs.available()).toBe(false);
    expect(SOURCE_FETCHERS.jooble.available()).toBe(false);
    vi.stubEnv("JOOBLE_API_KEY", "k");
    vi.stubEnv("USAJOBS_API_KEY", "k");
    vi.stubEnv("USAJOBS_EMAIL", "ops@example.com");
    expect(SOURCE_FETCHERS.jooble.available()).toBe(true);
    expect(SOURCE_FETCHERS.usajobs.available()).toBe(true);
  });

  it("are Jobs' own WorksLake sources, with the key they need named for Setup to-do", () => {
    const byId = new Map(BUILTIN_SOURCES.map((s) => [s.id, s]));
    expect(byId.get("jooble")).toMatchObject({ module: "jobs", secretRef: "env:JOOBLE" });
    expect(byId.get("usajobs")).toMatchObject({ module: "jobs", secretRef: "env:USAJOBS", geography: ["US"] });
  });
});
