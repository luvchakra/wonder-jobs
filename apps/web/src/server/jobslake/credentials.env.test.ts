import { describe, expect, it } from "vitest";
import { credentialStatus } from "./credentials";

describe("deployment-managed credentials", () => {
  it("reports TheirStack's keys as set from either variable, counting them, never showing one", async () => {
    const many = await credentialStatus("env:THEIRSTACK", { THEIRSTACK_API_KEYS: "ts_aaaaaaaaaaaaaaaa1, ts_bbbbbbbbbbbbbbbb2,ts_cccccccccccccccc3" });
    expect(many).toMatchObject({ present: true, managedBy: "environment", masked: "Set in the deployment (THEIRSTACK_API_KEYS / THEIRSTACK_API_KEY — 3 keys)" });
    expect(JSON.stringify(many)).not.toMatch(/ts_a|ts_b|ts_c/);
    expect(await credentialStatus("env:THEIRSTACK", { THEIRSTACK_API_KEY: "ts_single_key_value" })).toMatchObject({ present: true, masked: expect.stringContaining("1 key)") });
    expect(await credentialStatus("env:THEIRSTACK", {})).toMatchObject({ present: false, masked: "Not set (THEIRSTACK_API_KEYS or THEIRSTACK_API_KEY)" });
  });
  it("still reports Adzuna's pair", async () => {
    expect(await credentialStatus("env:ADZUNA", { ADZUNA_APP_ID: "x", ADZUNA_APP_KEY: "y" })).toMatchObject({ present: true });
    expect(await credentialStatus("env:ADZUNA", { ADZUNA_APP_ID: "x" })).toMatchObject({ present: false });
  });
});
