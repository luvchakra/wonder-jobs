import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS } from "@/domain/billing/plans";
import { planPoints } from "./Pricing";

describe("pricing on the landing page", () => {
  it("says what each plan gives from its own configured numbers", () => {
    // What every module shares first, then Jobs' own (2026-11-02: plans read as WonderWorks).
    expect(planPoints(DEFAULT_PLANS.plans.free)).toEqual(["1 scheduled search across every module, weekly", "5 WonderWorks AI drafts a month", "Jobs: 1 role to search as", "Jobs: 2 résumé designs"]);
    const pro = planPoints({ ...DEFAULT_PLANS.plans.pro, aiDraftsPerMonth: 75 });
    expect(pro).toContain("75 WonderWorks AI drafts a month");
    // The helper fills forms in a desktop browser only; phones apply the traditional way (CLAUDE.md).
    expect(pro).toContain("Jobs: the WonderWorks helper fills employers' forms in your desktop browser");
    expect(pro.join(" ")).not.toMatch(/phone/);
  });

  it("never lists the ATS report, which has no screen yet", () => {
    expect(planPoints(DEFAULT_PLANS.plans.max).join(" ")).not.toMatch(/ATS/);
  });
});

describe("lines the operator added in Plans & features", () => {
  it("follow the plan's own points, as written", () => {
    const pts = planPoints({ ...DEFAULT_PLANS.plans.pro, highlights: ["Priority support"] });
    expect(pts.at(-1)).toBe("Priority support");
  });
});
