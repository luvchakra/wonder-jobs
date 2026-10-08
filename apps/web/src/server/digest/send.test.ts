import { beforeAll, describe, expect, it } from "vitest";
import { readDigestState, sendDigest, setDigestEnabled, signDigestUnsubscribe, verifyDigestUnsubscribe } from "./send";
import { stateStore } from "@/server/state";

beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY ??= "test-only-secret-key-0123456789abcdef";
});

describe("sendDigest — once a day, only with activity, never when turned off", () => {
  it("skips a tenant with no activity, and one that turned it off", async () => {
    expect(await sendDigest("t-quiet", { now: new Date() })).toMatchObject({ sent: false, reason: "no activity" });
    await setDigestEnabled("t-off", false);
    expect(await sendDigest("t-off", { now: new Date() })).toMatchObject({ sent: false, reason: "turned off" });
    expect((await readDigestState("t-off")).enabled).toBe(false);
  });

  it("won't send twice on the same day once one went out", async () => {
    const now = new Date("2026-10-08T02:00:00Z");
    await stateStore.put("t-sent", "wj.digest", { enabled: true, lastSentAt: now.toISOString(), log: [{ at: now.toISOString(), key: "digest:t-sent:2026-10-08", sent: true }] });
    expect(await sendDigest("t-sent", { now })).toMatchObject({ sent: false, reason: "already sent today" });
  });

  it("an unsubscribe link only works for its own account", () => {
    const sig = signDigestUnsubscribe("t-a");
    expect(verifyDigestUnsubscribe("t-a", sig)).toBe(true);
    expect(verifyDigestUnsubscribe("t-b", sig)).toBe(false);
    expect(verifyDigestUnsubscribe("t-a", "")).toBe(false);
  });
});
