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
  it("never saves on its own when set to Ask me, at any level", () => {
    const p = { ...defaultPolicy(), save_jobs: "ask" as const };
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("save_jobs", p, level)).toBe("ask");
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

describe("translate_job — translating a job description is an AI call the candidate's own pick asks for", () => {
  it("is Ask me by default at every level, and only Off hides it", () => {
    expect(CAPABILITY_META.translate_job).toMatchObject({ default: "ask", risk: "low", external: false });
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) {
      expect(resolveCapability("translate_job", defaultPolicy(), level)).toBe("ask");
      expect(resolveCapability("translate_job", { ...defaultPolicy(), translate_job: "off" }, level)).toBe("skip");
    }
  });
  it("a saved policy that predates it still gets the default, not a hidden menu", () => {
    const { translate_job: _removed, ...older } = defaultPolicy();
    void _removed;
    expect(resolveCapability("translate_job", older as ReturnType<typeof defaultPolicy>, "guided")).toBe("ask");
  });
});

describe("easy_apply — the candidate's press of Easy Apply sends at once, unless they chose to see it first", () => {
  it("sends in one tap by default, at every level; Ask me shows the details first; Off turns it off", () => {
    expect(CAPABILITY_META.easy_apply).toMatchObject({ default: "automatic", external: true });
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("easy_apply", defaultPolicy(), level)).toBe("run");
    expect(resolveCapability("easy_apply", { ...defaultPolicy(), easy_apply: "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability("easy_apply", { ...defaultPolicy(), easy_apply: "off" }, "continuous")).toBe("skip");
  });
  it("a policy saved before it existed, or a failed lookup, asks first (fails closed)", () => {
    const { easy_apply: _removed, ...older } = defaultPolicy();
    void _removed;
    expect(resolveCapability("easy_apply", older as ReturnType<typeof defaultPolicy>, "guided")).toBe("ask");
  });
});
