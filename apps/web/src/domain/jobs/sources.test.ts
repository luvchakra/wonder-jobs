import { describe, expect, it } from "vitest";
import { JOB_SOURCES, reconcileSources } from "./sources";

const adzuna = JOB_SOURCES.find((s) => s.id === "adzuna_in")!;
const pick = (list: ReturnType<typeof reconcileSources>, id = "adzuna_in") => list.find((s) => s.id === id);

describe("reconcileSources", () => {
  it("keeps the candidate's own on/off choice for a credentialed source once the server has credentials — the reported bug: Adzuna wouldn't stay on", () => {
    expect(pick(reconcileSources([{ ...adzuna, enabled: true, chosen: true, available: true }]))).toMatchObject({ enabled: true, available: true });
    expect(pick(reconcileSources([{ ...adzuna, enabled: false, chosen: true, available: true }]))).toMatchObject({ enabled: false });
  });

  it("turns on a credentialed source the candidate never switched, once the server can search it", () => {
    expect(pick(reconcileSources([{ ...adzuna, enabled: false, available: true }]))).toMatchObject({ enabled: true });
  });

  it("forces a credentialed source off while the server says it is unavailable", () => {
    expect(pick(reconcileSources([{ ...adzuna, enabled: true, chosen: true, available: false }]))).toMatchObject({ enabled: false, available: false });
  });

  it("lets this session's server answer override a stale persisted availability", () => {
    expect(pick(reconcileSources([{ ...adzuna, enabled: true, chosen: true, available: false }], { adzuna_in: true }))).toMatchObject({ enabled: true, available: true });
  });

  it("keeps on/off for ordinary sources, drops retired ids and adds new ones", () => {
    const remotive = JOB_SOURCES.find((s) => s.id === "remotive")!;
    const out = reconcileSources([{ ...remotive, enabled: true }, { ...remotive, id: "retired", enabled: true }]);
    expect(out.map((s) => s.id)).toEqual(JOB_SOURCES.map((s) => s.id));
    expect(pick(out, "remotive")?.enabled).toBe(true);
  });
});
