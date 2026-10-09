import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, draftQuota, mergePlansConfig, planAtLeast, planForRef, planThatAllows, scheduleAllowance } from "./plans";

describe("mergePlansConfig", () => {
  it("keeps every default the stored copy doesn't override, and ignores garbage", () => {
    const cfg = mergePlansConfig({ plans: { pro: { priceMinor: 39_900, roles: "lots" } }, priceRefs: { max: { stripe: "price_max" } }, junk: 1 });
    expect(cfg.plans.pro.priceMinor).toBe(39_900);
    expect(cfg.plans.pro.roles).toBe(DEFAULT_PLANS.plans.pro.roles);
    expect(cfg.plans.free).toEqual(DEFAULT_PLANS.plans.free);
    expect(cfg.priceRefs).toEqual({ pro: {}, max: { stripe: "price_max" } });
  });
  it("falls back to the defaults entirely for a non-object", () => {
    expect(mergePlansConfig("nope").plans).toEqual(DEFAULT_PLANS.plans);
  });
});

describe("planForRef", () => {
  const cfg = mergePlansConfig({ priceRefs: { pro: { stripe: "price_pro" }, max: { stripe: "price_max", razorpay: "plan_max" } } });
  it("maps a mapped id to its plan and anything else to Pro — never to the top tier by accident", () => {
    expect(planForRef("price_max", cfg)).toBe("max");
    expect(planForRef("plan_max", cfg)).toBe("max");
    expect(planForRef("price_pro", cfg)).toBe("pro");
    expect(planForRef("price_unknown", cfg)).toBe("pro");
    expect(planForRef(undefined, cfg)).toBe("pro");
  });
});

describe("draftQuota and plan order", () => {
  it("allows up to the limit and counts what's left", () => {
    expect(draftQuota(5, 4)).toEqual({ allowed: true, remaining: 1, limit: 5 });
    expect(draftQuota(5, 5)).toEqual({ allowed: false, remaining: 0, limit: 5 });
  });
  it("orders plans", () => {
    expect(planAtLeast("max", "pro")).toBe(true);
    expect(planAtLeast("free", "pro")).toBe(false);
    expect(planThatAllows(DEFAULT_PLANS, (l) => l.atsReport)).toBe("max");
    expect(planThatAllows(DEFAULT_PLANS, (l) => l.applyWithWonder)).toBe("pro");
  });
});

describe("scheduleAllowance", () => {
  it("lets Free keep one weekly search and names the plan a second or a daily one needs", () => {
    expect(scheduleAllowance("free", DEFAULT_PLANS, 0, "weekly")).toEqual({ ok: true });
    expect(scheduleAllowance("free", DEFAULT_PLANS, 1, "weekly")).toMatchObject({ ok: false, needs: "pro" });
    expect(scheduleAllowance("free", DEFAULT_PLANS, 0, "daily")).toMatchObject({ ok: false, needs: "pro" });
    expect(scheduleAllowance("pro", DEFAULT_PLANS, 0, "keep_watch")).toMatchObject({ ok: false, needs: "max" });
    expect(scheduleAllowance("max", DEFAULT_PLANS, 9, "keep_watch")).toEqual({ ok: true });
    expect(scheduleAllowance("max", DEFAULT_PLANS, 10, "daily")).toMatchObject({ ok: false, needs: null });
  });
  it("never limits a manual (saved) search", () => {
    expect(scheduleAllowance("free", DEFAULT_PLANS, 5, "manual")).toEqual({ ok: true });
  });
});

describe("plan highlights — extra feature lines an operator adds", () => {
  it("keeps valid lines and drops a bad list, leaving the default (none)", () => {
    const ok = mergePlansConfig({ plans: { pro: { highlights: ["Priority support", "Early access to new features"] } } });
    expect(ok.plans.pro.highlights).toEqual(["Priority support", "Early access to new features"]);
    expect(ok.plans.free.highlights).toEqual([]);
    const tooLong = mergePlansConfig({ plans: { pro: { highlights: ["x".repeat(91)] } } });
    expect(tooLong.plans.pro.highlights).toEqual([]);
    const tooMany = mergePlansConfig({ plans: { pro: { highlights: Array.from({ length: 11 }, (_, i) => `Line ${i}`) } } });
    expect(tooMany.plans.pro.highlights).toEqual([]);
  });
});
