import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { jobsLakeStore } from "@/server/jobslake/store";
import { careersKeyStatus, clearCareersKey, resolveCareersKey, saveCareersKey } from "./key";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-the-careers-site-key-0123456789";
const KEY = "wjcs_" + "Z".repeat(30) + "wxyz";

beforeEach(async () => {
  await clearCareersKey("reset");
});

describe("the careers key setting", () => {
  it("stores the key encrypted and shows only a mask", async () => {
    const saved = await saveCareersKey("admin@wonderapps.biz", KEY);
    expect(saved).toMatchObject({ source: "saved", masked: "wjcs_••••••••wxyz" });
    const stored = await jobsLakeStore().getCredential("careers_site_key");
    expect(stored?.ciphertext).toBeTruthy();
    expect(stored?.ciphertext).not.toContain(KEY);
    expect(stored?.ciphertext).not.toContain("ZZZZ");
    const status = await careersKeyStatus({});
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(status.masked).toBe("wjcs_••••••••wxyz");
    expect(await resolveCareersKey({})).toBe(KEY);
  });

  it("refuses anything that isn't a career-site key", async () => {
    await expect(saveCareersKey("a", "sk-not-a-careers-key-1234567890")).rejects.toThrow(/wjcs_/);
    await expect(saveCareersKey("a", "wjcs_short")).rejects.toThrow();
  });

  it("audits every save and clear with who, when and the last four only", async () => {
    await saveCareersKey("admin@wonderapps.biz", KEY);
    await clearCareersKey("other@wonderapps.biz");
    const events = (await jobsLakeStore().listAudit(10)).filter((e) => e.action.startsWith("careers_key"));
    expect(events.slice(0, 2).map((e) => [e.action, e.actor, e.detail])).toEqual([
      ["careers_key_cleared", "other@wonderapps.biz", { last4: "wxyz" }],
      ["careers_key_saved", "admin@wonderapps.biz", { last4: "wxyz" }],
    ]);
    expect(events.every((e) => !!e.at)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("falls back to WONDERJOBS_CAREERS_KEY only while nothing is saved", async () => {
    const envKey = "wjcs_" + "E".repeat(30) + "envk";
    expect(await resolveCareersKey({ WONDERJOBS_CAREERS_KEY: envKey })).toBe(envKey);
    expect(await careersKeyStatus({ WONDERJOBS_CAREERS_KEY: envKey })).toEqual({ source: "environment", masked: "wjcs_••••••••envk" });
    await saveCareersKey("a@b.c", KEY);
    expect(await resolveCareersKey({ WONDERJOBS_CAREERS_KEY: envKey })).toBe(KEY);
    await clearCareersKey("a@b.c");
    expect(await resolveCareersKey({})).toBeNull();
    expect(await careersKeyStatus({})).toEqual({ source: "none" });
  });
});
