import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const LEVELS = ["assist", "guided", "autonomous", "continuous"] as const;
const ASK_FIRST = ["cofounders.connect", "cofounders.join", "cofounders.invite", "cofounders.share_contact"] as const;

describe("co-founders capabilities — every press that reaches another person goes through resolveCapability", () => {
  it("connect, join, invite and share-contact ask first at every level by default; Automatic runs; Off skips", () => {
    for (const cap of ASK_FIRST) {
      expect(CAPABILITY_META[cap], cap).toMatchObject({ default: "ask", external: true });
      for (const level of LEVELS) expect(resolveCapability(cap, defaultPolicy(), level), `${cap} ${level}`).toBe("ask");
      expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "automatic" }, "guided")).toBe("run");
      expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "off" }, "continuous")).toBe("skip");
    }
  });

  it("a message is the person's own typed and sent press, so it sends at once; Ask me asks; Off turns messaging off", () => {
    expect(CAPABILITY_META["cofounders.message"].default).toBe("automatic");
    expect(resolveCapability("cofounders.message", defaultPolicy(), "assist")).toBe("run");
    expect(resolveCapability("cofounders.message", { ...defaultPolicy(), "cofounders.message": "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability("cofounders.message", { ...defaultPolicy(), "cofounders.message": "off" }, "guided")).toBe("skip");
  });

  it("sharing contact details is never decided for the person, even on Automatic at Assist", () => {
    expect(resolveCapability("cofounders.share_contact", { ...defaultPolicy(), "cofounders.share_contact": "automatic" }, "assist")).toBe("ask");
  });

  it("a policy saved before they existed asks first — fails closed", () => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    for (const cap of ASK_FIRST) delete older[cap];
    for (const cap of ASK_FIRST) for (const level of LEVELS) expect(resolveCapability(cap, older as ReturnType<typeof defaultPolicy>, level)).toBe("ask");
  });

  it("are module capabilities: Jobs' Automation list is unchanged", () => {
    for (const cap of [...ASK_FIRST, "cofounders.message"] as const) {
      expect(MODULE_CAPABILITIES).toContain(cap);
      expect(CAPABILITIES as readonly string[]).not.toContain(cap);
    }
  });
});
