import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;

describe("teaching.apply and teaching.book_demo — the teacher's press sends at once, unless they chose to see it first (like Easy Apply)", () => {
  it.each(["teaching.apply", "teaching.book_demo"] as const)("%s: one tap by default at every level; Ask me shows it first; Off turns it off", (cap) => {
    expect(CAPABILITY_META[cap]).toMatchObject({ default: "automatic", external: true, risk: "low" });
    for (const level of LEVELS) expect(resolveCapability(cap, defaultPolicy(), level)).toBe("run");
    expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "off" }, "continuous")).toBe("skip");
  });

  it.each(["teaching.apply", "teaching.book_demo"] as const)("%s: a policy saved before it existed (or a failed lookup) asks first — fails closed", (cap) => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    delete older[cap];
    for (const level of LEVELS) expect(resolveCapability(cap, older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("are module capabilities: Jobs' Automation list is unchanged", () => {
    expect(MODULE_CAPABILITIES).toEqual(expect.arrayContaining(["teaching.apply", "teaching.book_demo"]));
    expect(CAPABILITIES as readonly string[]).not.toContain("teaching.apply");
    expect(CAPABILITIES as readonly string[]).not.toContain("teaching.book_demo");
  });
});
