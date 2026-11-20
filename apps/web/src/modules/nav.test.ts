import { describe, expect, it } from "vitest";
import { isActivePath } from "@/wonderworks/chrome/nav";
import { moduleFromPath, moduleNav } from "./nav";
import { PRIMARY_NAV } from "./jobs/nav";

describe("one set of five tabs for every module (docs/WONDERWORKS_PLATFORM.md §4.1)", () => {
  it("Jobs keeps its four places, with Network in the middle", () => {
    expect(moduleNav("jobs")).toBe(PRIMARY_NAV);
    expect(PRIMARY_NAV.map((n) => [n.label, n.href])).toEqual([
      ["Find", "/app/jobs"],
      ["Saved", "/app/saved"],
      ["Network", "/app/network"],
      ["Pipeline", "/app/applications"],
      ["You", "/app/you"],
    ]);
  });

  it("a live module's Find, Saved, Pipeline and You go to its own pages, with its Pipeline label (Internships: Applications)", () => {
    const nav = moduleNav("internships");
    expect(nav.map((n) => [n.label, n.href])).toEqual([
      ["Find", "/app/m/internships"],
      ["Saved", "/app/m/internships/saved"],
      ["Network", "/app/network"],
      ["Applications", "/app/m/internships/pipeline"],
      ["You", "/app/m/internships/you"],
    ]);
    const active = (p: string) => nav.filter((n) => isActivePath(p, n)).map((n) => n.label);
    expect(active("/app/m/internships")).toEqual(["Find"]);
    expect(active("/app/m/internships/pipeline")).toEqual(["Applications"]);
    expect(active("/app/m/internships/you/profile")).toEqual(["You"]);
    expect(active("/app/m/internships/company")).toEqual(["You"]);
    expect(active("/app/settings")).toEqual(["You"]);
    expect(active("/app/network")).toEqual(["Network"]);
    expect(active("/app/network/np_abc123")).toEqual(["Network"]);
  });

  it("a page's module: a live module's pages, Jobs' four places, or none for shared pages", () => {
    expect(moduleFromPath("/app/m/internships/saved")).toBe("internships");
    expect(moduleFromPath("/app/m/teaching/pipeline")).toBe("teaching");
    expect(moduleFromPath("/app/m/marketplace")).toBe("marketplace");
    expect(moduleFromPath("/app/m/nope")).toBeNull(); // not a module
    expect(moduleFromPath("/app/jobs")).toBe("jobs");
    expect(moduleFromPath("/app/jobs/abc")).toBe("jobs");
    expect(moduleFromPath("/app/saved")).toBe("jobs");
    expect(moduleFromPath("/app/applications/a1")).toBe("jobs");
    expect(moduleFromPath("/app/you")).toBe("jobs");
    expect(moduleFromPath("/app/notifications")).toBeNull();
    expect(moduleFromPath("/app/network")).toBeNull(); // every module's: the tabs stay the active module's
    expect(moduleFromPath("/app/settings")).toBeNull();
  });
});
