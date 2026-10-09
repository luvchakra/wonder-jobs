import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS } from "@/domain/billing/plans";
import { planPoints } from "./Pricing";

describe("pricing on the landing page", () => {
  it("says what each plan gives from its own configured numbers", () => {
    expect(planPoints(DEFAULT_PLANS.plans.free)).toEqual(["1 role to search for", "1 scheduled search, weekly", "5 AI drafts a month", "2 résumé designs"]);
    const pro = planPoints({ ...DEFAULT_PLANS.plans.pro, aiDraftsPerMonth: 75 });
    expect(pro).toContain("75 AI drafts a month");
    expect(pro).toContain("Apply with Wonder — fills employer forms, on computer and phone");
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
