import { describe, expect, it } from "vitest";
import { ADMIN_MENUS, activeHref } from "./AdminShell";

describe("admin menus", () => {
  it("every admin page is in exactly one menu, with no duplicates", () => {
    const hrefs = ADMIN_MENUS.flatMap((m) => m.links.map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const p of ["/platform/jobs-lake/sources", "/platform/jobs-apply", "/platform/companies", "/platform/billing/plans", "/platform/jobs-lake/scheduler"]) expect(hrefs).toContain(p);
  });

  it("highlights the page a path is on, including its sub-pages; Overview only on itself", () => {
    expect(activeHref("/platform/jobs-lake")).toBe("/platform/jobs-lake");
    expect(activeHref("/platform/jobs-lake/sources/src_123")).toBe("/platform/jobs-lake/sources");
    expect(activeHref("/platform/billing/prices")).toBe("/platform/billing/prices");
    expect(activeHref("/platform/jobs-lake/unknown")).toBeUndefined();
  });
});
