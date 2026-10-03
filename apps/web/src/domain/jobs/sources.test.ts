import { describe, expect, it } from "vitest";
import { JOB_SOURCES, reconcileSources } from "./sources";

const adzuna = JOB_SOURCES.find((s) => s.id === "adzuna_in")!;

describe("reconcileSources", () => {
  it("keeps the candidate's on/off choice for a credentialed source once the server has credentials", () => {
    const out = reconcileSources([{ ...adzuna, enabled: true, available: true }]);
    expect(out.find((s) => s.id === "adzuna_in")).toMatchObject({ enabled: true, available: true });
  });

  it("forces a credentialed source off while the server says it is unavailable", () => {
    const out = reconcileSources([{ ...adzuna, enabled: true, available: false }]);
    expect(out.find((s) => s.id === "adzuna_in")).toMatchObject({ enabled: false, available: false });
  });

  it("lets this session's server answer override a stale persisted availability", () => {
    const out = reconcileSources([{ ...adzuna, enabled: true, available: false }], { adzuna_in: true });
    expect(out.find((s) => s.id === "adzuna_in")).toMatchObject({ enabled: true, available: true });
  });

  it("keeps on/off for ordinary sources, drops retired ids and adds new ones", () => {
    const remotive = JOB_SOURCES.find((s) => s.id === "remotive")!;
    const out = reconcileSources([{ ...remotive, enabled: true }, { ...remotive, id: "retired", enabled: true }]);
    expect(out.map((s) => s.id)).toEqual(JOB_SOURCES.map((s) => s.id));
    expect(out.find((s) => s.id === "remotive")?.enabled).toBe(true);
  });
});
