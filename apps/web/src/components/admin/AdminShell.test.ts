import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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

  it("every admin page is reachable from the rail (sub-pages and the billing landing aside)", () => {
    const root = join(__dirname, "../../app/platform");
    const pages = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n === "page.tsx" ? [d] : []));
    })(root)
      .map((d) => `/platform/${relative(root, d)}`.replace(/\/$/, ""))
      .filter((p) => !p.includes("[") && p !== "/platform/billing");
    const hrefs = new Set(ADMIN_MENUS.flatMap((m) => m.links.map((l) => l.href)));
    expect(pages.filter((p) => !hrefs.has(p))).toEqual([]);
  });

  it("reads as WonderWorks: no old product names in the rail, and sections start with Data", () => {
    const words = ADMIN_MENUS.flatMap((m) => [m.label, m.section ?? "", ...m.links.map((l) => l.label)]).join(" ");
    expect(words).not.toMatch(/WonderJobs|WonderStar|JobsApply|JobsLake|Jobs data/);
    expect(ADMIN_MENUS.filter((m) => m.section).map((m) => m.section)).toEqual(["Data", "Running", "Accounts", "Business", "Settings"]);
  });
});
