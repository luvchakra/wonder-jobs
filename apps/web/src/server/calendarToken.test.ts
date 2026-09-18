import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY = "test-only-secret-do-not-use-in-production";
});

describe("calendar feed signature", () => {
  it("verifies a signature it generated itself", async () => {
    const { signTenantForCalendar, verifyTenantCalendarSignature } = await import("./calendarToken");
    const sig = signTenantForCalendar("tenant-123");
    expect(verifyTenantCalendarSignature("tenant-123", sig)).toBe(true);
  });

  it("rejects a signature for a different tenant", async () => {
    const { signTenantForCalendar, verifyTenantCalendarSignature } = await import("./calendarToken");
    const sig = signTenantForCalendar("tenant-123");
    expect(verifyTenantCalendarSignature("tenant-456", sig)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const { signTenantForCalendar, verifyTenantCalendarSignature } = await import("./calendarToken");
    const sig = signTenantForCalendar("tenant-123");
    const tampered = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");
    expect(verifyTenantCalendarSignature("tenant-123", tampered)).toBe(false);
  });

  it("rejects an empty signature instead of throwing", async () => {
    const { verifyTenantCalendarSignature } = await import("./calendarToken");
    expect(verifyTenantCalendarSignature("tenant-123", "")).toBe(false);
  });
});
