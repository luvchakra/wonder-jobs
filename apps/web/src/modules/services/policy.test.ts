import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;
const CAPS = ["services.request_quote", "services.book"] as const;

describe("services.request_quote and services.book — the client's press sends at once, unless they chose to see it first (like Easy Apply)", () => {
  it.each(CAPS)("%s: one tap by default at every level; Ask me shows it first; Off turns it off", (cap) => {
    expect(CAPABILITY_META[cap]).toMatchObject({ default: "automatic", external: true, risk: "low" });
    for (const level of LEVELS) expect(resolveCapability(cap, defaultPolicy(), level)).toBe("run");
    expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "off" }, "continuous")).toBe("skip");
  });

  it.each(CAPS)("%s: a policy saved before it existed (or a failed lookup) asks first — fails closed", (cap) => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    delete older[cap];
    for (const level of LEVELS) expect(resolveCapability(cap, older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("are module capabilities: Jobs' Automation list is unchanged", () => {
    expect(MODULE_CAPABILITIES).toEqual(expect.arrayContaining([...CAPS]));
    for (const cap of CAPS) expect(CAPABILITIES as readonly string[]).not.toContain(cap);
  });
});
