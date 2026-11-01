import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

describe("scholarships.apply — the student's press of Apply sends at once, unless they chose to see it first", () => {
  it("sends in one tap by default; Ask me shows it first; Off turns it off", () => {
    expect(CAPABILITY_META["scholarships.apply"]).toMatchObject({ default: "automatic", external: true, risk: "low" });
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("scholarships.apply", defaultPolicy(), level)).toBe("run");
    expect(resolveCapability("scholarships.apply", { ...defaultPolicy(), "scholarships.apply": "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability("scholarships.apply", { ...defaultPolicy(), "scholarships.apply": "off" }, "continuous")).toBe("skip");
  });

  it("a policy without it (saved before it existed, or a failed lookup) asks first — fails closed", () => {
    const { "scholarships.apply": _a, "scholarships.draft": _d, ...older } = defaultPolicy();
    void _a;
    void _d;
    for (const c of ["scholarships.apply", "scholarships.draft"] as const) expect(resolveCapability(c, older as ReturnType<typeof defaultPolicy>, "continuous")).toBe("ask");
  });

  it("is a module capability: Jobs' Automation list is unchanged", () => {
    expect(MODULE_CAPABILITIES).toEqual(expect.arrayContaining(["scholarships.apply", "scholarships.draft"]));
    expect(CAPABILITIES as readonly string[]).not.toContain("scholarships.apply");
  });
});

describe("scholarships.draft — AI only drafts essays and statements", () => {
  it("asks by default, never runs as an external effect, and Off turns it off", () => {
    expect(CAPABILITY_META["scholarships.draft"]).toMatchObject({ default: "ask", external: false });
    expect(resolveCapability("scholarships.draft", defaultPolicy(), "continuous")).toBe("ask");
    expect(resolveCapability("scholarships.draft", { ...defaultPolicy(), "scholarships.draft": "off" }, "continuous")).toBe("skip");
  });
});
