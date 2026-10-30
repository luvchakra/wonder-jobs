import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;

describe("therapists.book — the client's press of Request a session; Ask me by default", () => {
  it("asks first by default at every level; Automatic sends at once; Off turns it off", () => {
    expect(CAPABILITY_META["therapists.book"]).toMatchObject({ default: "ask", external: true, risk: "low" });
    for (const level of LEVELS) expect(resolveCapability("therapists.book", defaultPolicy(), level)).toBe("ask");
    expect(resolveCapability("therapists.book", { ...defaultPolicy(), "therapists.book": "automatic" }, "guided")).toBe("run");
    expect(resolveCapability("therapists.book", { ...defaultPolicy(), "therapists.book": "off" }, "continuous")).toBe("skip");
  });

  it("a policy saved before it existed asks first — fails closed", () => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    delete older["therapists.book"];
    for (const level of LEVELS) expect(resolveCapability("therapists.book", older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("is a module capability: Jobs' Automation list is unchanged", () => {
    expect(MODULE_CAPABILITIES).toContain("therapists.book");
    expect(CAPABILITIES as readonly string[]).not.toContain("therapists.book");
  });
});
