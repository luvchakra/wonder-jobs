import { describe, expect, it } from "vitest";
import { CAPABILITY_META, defaultPolicy, resolveCapability } from "./policy";

describe("save_jobs — the saved list is the candidate's own unless they turn auto-save on", () => {
  it("is off by default at every automation level", () => {
    expect(CAPABILITY_META.save_jobs.default).toBe("off");
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("save_jobs", defaultPolicy(), level)).toBe("skip");
  });
  it("runs once the candidate turns it on", () => {
    const p = defaultPolicy();
    expect(resolveCapability("save_jobs", { ...p, save_jobs: "automatic" }, "guided")).toBe("run");
  });
});

describe("migratePolicy — a policy saved before auto-save became opt-in", () => {
  it("moves the old default to off, once", async () => {
    const { migratePolicy } = await import("./policy");
    expect(migratePolicy({ save_jobs: "automatic" }, 1).save_jobs).toBe("off");
    expect(migratePolicy({ save_jobs: "automatic" }, 0).save_jobs).toBe("off");
    // A choice made after the change stands.
    expect(migratePolicy({ save_jobs: "automatic" }, 2).save_jobs).toBe("automatic");
    // Everything else is kept, and new capabilities take their default.
    expect(migratePolicy({ generate_resume: "off" }, 1)).toMatchObject({ generate_resume: "off", final_submit: "off" });
  });
});

describe("drafts — 'Ask me' by default, since each is a paid AI call", () => {
  it("defaults to ask, and a policy saved before v3 moves its old default", async () => {
    const { migratePolicy, CAPABILITY_META } = await import("./policy");
    expect(CAPABILITY_META.generate_resume.default).toBe("ask");
    expect(CAPABILITY_META.generate_cover_letter.default).toBe("ask");
    expect(migratePolicy({ generate_resume: "automatic", generate_cover_letter: "automatic" }, 2)).toMatchObject({ generate_resume: "ask", generate_cover_letter: "ask" });
    // A choice made at v3 or later stands; an explicit Off is kept.
    expect(migratePolicy({ generate_resume: "automatic" }, 3).generate_resume).toBe("automatic");
    expect(migratePolicy({ generate_cover_letter: "off" }, 2).generate_cover_letter).toBe("off");
  });
});
