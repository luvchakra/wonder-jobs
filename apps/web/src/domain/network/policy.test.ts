import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_META, defaultPolicy, MODULE_CAPABILITIES, resolveCapability } from "@/domain/automation/policy";

const CAPS = ["network.connect", "network.message", "network.post"] as const;

describe("network capabilities — a request or message to another member goes through resolveCapability", () => {
  it("are module-namespaced, external, and send on the member's own press by default; Ask me asks; Off skips", () => {
    for (const cap of CAPS) {
      expect(MODULE_CAPABILITIES).toContain(cap);
      expect(CAPABILITIES as readonly string[]).not.toContain(cap);
      expect(CAPABILITY_META[cap], cap).toMatchObject({ default: "automatic", external: true, risk: "low" });
      for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(resolveCapability(cap, defaultPolicy(), level), `${cap} ${level}`).toBe("run");
      expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "ask" }, "continuous")).toBe("ask");
      expect(resolveCapability(cap, { ...defaultPolicy(), [cap]: "off" }, "continuous")).toBe("skip");
    }
  });

  it("a policy saved before they existed asks first — fails closed", () => {
    const older = { ...defaultPolicy() } as Record<string, unknown>;
    for (const cap of CAPS) delete older[cap];
    for (const cap of CAPS) expect(resolveCapability(cap, older as ReturnType<typeof defaultPolicy>, "continuous")).toBe("ask");
  });
});
