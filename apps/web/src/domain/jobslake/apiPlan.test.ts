import { describe, expect, it } from "vitest";
import { apiPlanConfig, decideQuota, formatApiPrice, overageReports, utcDay } from "./apiPlan";

const config = { freeMonthly: 100, maxMonthly: 1000 };

describe("apiPlanConfig", () => {
  it("defaults to 100 free and a 100,000 safety cap", () => {
    expect(apiPlanConfig({})).toEqual({ freeMonthly: 100, maxMonthly: 100_000 });
  });
  it("reads the environment and ignores nonsense", () => {
    expect(apiPlanConfig({ JOBSLAKE_API_FREE_SEARCHES: "250", JOBSLAKE_API_MAX_MONTHLY: "5000" })).toEqual({ freeMonthly: 250, maxMonthly: 5000 });
    expect(apiPlanConfig({ JOBSLAKE_API_FREE_SEARCHES: "-3", JOBSLAKE_API_MAX_MONTHLY: "lots" })).toEqual({ freeMonthly: 100, maxMonthly: 100_000 });
    expect(apiPlanConfig({ JOBSLAKE_API_FREE_SEARCHES: "0" }).freeMonthly).toBe(0);
    // The cap never sits below the free allowance.
    expect(apiPlanConfig({ JOBSLAKE_API_FREE_SEARCHES: "500", JOBSLAKE_API_MAX_MONTHLY: "10" }).maxMonthly).toBe(500);
  });
  it("takes the admin's stored value first, then the environment, then the default — field by field", () => {
    const env = { JOBSLAKE_API_FREE_SEARCHES: "250", JOBSLAKE_API_MAX_MONTHLY: "5000" };
    expect(apiPlanConfig(env, { freeMonthly: 40, maxMonthly: 900 })).toEqual({ freeMonthly: 40, maxMonthly: 900 });
    expect(apiPlanConfig(env, { freeMonthly: 40 })).toEqual({ freeMonthly: 40, maxMonthly: 5000 });
    expect(apiPlanConfig({}, { maxMonthly: 900 })).toEqual({ freeMonthly: 100, maxMonthly: 900 });
    expect(apiPlanConfig(env, { freeMonthly: -1 })).toEqual({ freeMonthly: 250, maxMonthly: 5000 });
    expect(apiPlanConfig({}, undefined)).toEqual({ freeMonthly: 100, maxMonthly: 100_000 });
  });
});

describe("decideQuota", () => {
  it("allows free usage up to and including the allowance", () => {
    expect(decideQuota({ totalAfter: 1, units: 1, billingActive: false, config })).toEqual({ allowed: true, billable: false });
    expect(decideQuota({ totalAfter: 100, units: 1, billingActive: false, config })).toEqual({ allowed: true, billable: false });
  });
  it("stops at the free allowance without pay-as-you-go, naming the limit and where to turn billing on", () => {
    const d = decideQuota({ totalAfter: 101, units: 1, billingActive: false, config });
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.reason).toBe("free_exhausted");
      expect(d.message).toContain("100 free");
      expect(d.message).toContain("Account → JobsLake API");
    }
  });
  it("bills past the allowance when pay-as-you-go is active", () => {
    expect(decideQuota({ totalAfter: 101, units: 1, billingActive: true, config })).toEqual({ allowed: true, billable: true });
  });
  it("enforces the safety cap even with billing on", () => {
    const d = decideQuota({ totalAfter: 1001, units: 1, billingActive: true, config });
    expect(d).toMatchObject({ allowed: false, reason: "safety_cap" });
    expect(decideQuota({ totalAfter: 1000, units: 1, billingActive: true, config }).allowed).toBe(true);
  });
});

describe("overageReports", () => {
  const today = "2026-10-09";
  it("reports only the units past the month's free allowance, cumulatively, per complete day", () => {
    const days = [
      { day: "2026-10-01", units: 60, reportedUnits: 0 },
      { day: "2026-10-02", units: 60, reportedUnits: 0 }, // 120 → 20 over
      { day: "2026-10-03", units: 5, reportedUnits: 0 }, // 125 → 5 over
      { day: "2026-10-09", units: 50, reportedUnits: 0 }, // today: not complete, not reported
    ];
    const r = overageReports("t-1", days, 100, today);
    expect(r.map((x) => [x.day, x.value])).toEqual([
      ["2026-10-02", 20],
      ["2026-10-03", 5],
    ]);
    expect(r[0].identifier).toBe("jl:t-1:2026-10-02");
    expect(r[0].timestamp).toBe(Date.parse("2026-10-02T23:59:59Z") / 1000);
  });
  it("never reports a day twice", () => {
    const days = [
      { day: "2026-10-01", units: 150, reportedUnits: 50 },
      { day: "2026-10-02", units: 10, reportedUnits: 0 },
    ];
    expect(overageReports("t-1", days, 100, today).map((x) => [x.day, x.value])).toEqual([["2026-10-02", 10]]);
  });
  it("starts each calendar month with a fresh allowance", () => {
    const days = [
      { day: "2026-09-30", units: 150, reportedUnits: 0 },
      { day: "2026-10-01", units: 90, reportedUnits: 0 },
    ];
    expect(overageReports("t-1", days, 100, today).map((x) => [x.day, x.value])).toEqual([["2026-09-30", 50]]);
  });
  it("reports nothing within the allowance", () => {
    expect(overageReports("t-1", [{ day: "2026-10-01", units: 100, reportedUnits: 0 }], 100, today)).toEqual([]);
  });
});

describe("formatApiPrice", () => {
  it("formats Stripe's minor-unit decimal, fractional cents included", () => {
    expect(formatApiPrice({ unitAmountDecimal: "1", currency: "USD", perUnits: 1 })).toBe("$0.01 per search");
    expect(formatApiPrice({ unitAmountDecimal: "0.5", currency: "USD", perUnits: 1 })).toBe("$0.005 per search");
    expect(formatApiPrice({ unitAmountDecimal: "200", currency: "USD", perUnits: 1000 })).toBe("$2.00 per 1,000 searches");
  });
});

describe("utcDay", () => {
  it("is the UTC date", () => {
    expect(utcDay(Date.parse("2026-10-09T23:30:00-05:00"))).toBe("2026-10-10");
  });
});
