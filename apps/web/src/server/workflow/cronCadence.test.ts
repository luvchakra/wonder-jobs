import { afterEach, describe, expect, it } from "vitest";
import { cronEarlyWindowMs, DAILY_CRON_EARLY_MS } from "./cronCadence";

describe("cronEarlyWindowMs", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_INTERVAL_MINUTES;
  });

  it("lets a once-a-day cron (Hobby, the default) take what falls due in the next hour", () => {
    process.env.CRON_SECRET = "x";
    expect(cronEarlyWindowMs()).toBe(DAILY_CRON_EARLY_MS);
    expect(DAILY_CRON_EARLY_MS).toBe(60 * 60_000);
  });

  it("fires on the minute when the cron runs at least hourly", () => {
    process.env.CRON_SECRET = "x";
    process.env.CRON_INTERVAL_MINUTES = "15";
    expect(cronEarlyWindowMs()).toBe(0);
  });
});
