import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;
const EVENTS_CAPS = ["events.rsvp", "events.cancel", "events.promote"] as const;

describe("events capabilities — the person's own press; Automatic by default, ask or off on request", () => {
  it("each is low-risk and external (so confirmation, idempotency and audit apply)", () => {
    for (const c of EVENTS_CAPS) expect(CAPABILITY_META[c]).toMatchObject({ default: "automatic", external: true, risk: "low" });
  });

  it("Ask me shows it first; Off turns it off, at every level", () => {
    for (const c of EVENTS_CAPS) {
      for (const level of LEVELS) {
        expect(resolveCapability(c, { ...defaultPolicy(), [c]: "ask" }, level)).toBe("ask");
        expect(resolveCapability(c, { ...defaultPolicy(), [c]: "off" }, level)).toBe("skip");
      }
      expect(resolveCapability(c, { ...defaultPolicy(), [c]: "automatic" }, "guided")).toBe("run");
    }
  });

  it("a policy saved before they existed asks first — fails closed", () => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    for (const c of EVENTS_CAPS) delete older[c];
    for (const c of EVENTS_CAPS) for (const level of LEVELS) expect(resolveCapability(c, older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("are module capabilities: Jobs' Automation list is unchanged", () => {
    for (const c of EVENTS_CAPS) {
      expect(MODULE_CAPABILITIES).toContain(c);
      expect(CAPABILITIES as readonly string[]).not.toContain(c);
    }
  });
});
