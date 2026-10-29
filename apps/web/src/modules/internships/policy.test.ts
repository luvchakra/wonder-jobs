import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

describe("internships.apply — the student's press of Apply sends at once, unless they chose to see it first", () => {
  it("sends in one tap by default, at every level; Ask me shows it first; Off turns it off", () => {
    expect(CAPABILITY_META["internships.apply"]).toMatchObject({ default: "automatic", external: true, risk: "low" });
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("internships.apply", defaultPolicy(), level)).toBe("run");
    expect(resolveCapability("internships.apply", { ...defaultPolicy(), "internships.apply": "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability("internships.apply", { ...defaultPolicy(), "internships.apply": "off" }, "continuous")).toBe("skip");
  });

  it("a policy without it (saved before it existed, or a failed lookup) asks first — fails closed", () => {
    const { "internships.apply": _removed, ...older } = defaultPolicy();
    void _removed;
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability("internships.apply", older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("the student's own choice for one internship wins either way", () => {
    expect(resolveCapability("internships.apply", { ...defaultPolicy(), "internships.apply": "off" }, "guided", "allow")).toBe("run");
    expect(resolveCapability("internships.apply", defaultPolicy(), "guided", "deny")).toBe("skip");
  });

  it("is a module capability: Jobs' Automation list is unchanged", () => {
    expect(MODULE_CAPABILITIES).toContain("internships.apply");
    expect(CAPABILITIES as readonly string[]).not.toContain("internships.apply");
  });
});
