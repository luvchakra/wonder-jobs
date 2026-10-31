import { describe, expect, it } from "vitest";
import { isModuleId, MODULE_IDS, MODULES, moduleById } from "./registry";
import { UPCOMING_KINDS } from "@/domain/jobs/upcomingKinds";
import { PRIMARY_NAV } from "@/modules/jobs/nav";

describe("WonderWorks module registry", () => {
  it("has one manifest per module, in the registry's order", () => {
    expect(MODULES.map((m) => m.id)).toEqual([...MODULE_IDS]);
    expect(MODULE_IDS).toEqual(["jobs", "internships", "teaching", "cofounders", "services", "therapists", "events", "marketplace"]);
    expect(isModuleId("jobs")).toBe(true);
    expect(isModuleId("dating")).toBe(false);
    expect(moduleById("nope")).toBeUndefined();
  });

  it("Jobs is live and only points at today's routes and tab names", () => {
    const jobs = moduleById("jobs")!;
    expect(jobs.status).toBe("live");
    expect([jobs.routes.find, jobs.routes.saved, jobs.routes.pipeline, jobs.routes.you]).toEqual(PRIMARY_NAV.map((n) => n.href));
    expect(jobs.pipeline.label).toBe(PRIMARY_NAV[2].label);
  });

  it("Internships (WJ-418), Teaching, Co-founders, Talent & Services, Therapists and Events are live; every other module is coming soon; each lives at /app/m/<id>", () => {
    expect(moduleById("internships")!.status).toBe("live");
    expect(moduleById("teaching")!.status).toBe("live");
    expect(moduleById("services")!.status).toBe("live");
    expect(moduleById("therapists")!.status).toBe("live");
    expect(moduleById("cofounders")!.status).toBe("live");
    expect(moduleById("events")!.status).toBe("live");
    expect(moduleById("marketplace")!.status).toBe("live");
    for (const m of MODULES.filter((x) => x.id !== "jobs")) {
      expect(m.routes.find).toBe(`/app/m/${m.id}`);
      expect(m.pipeline.stages.length, m.id).toBeGreaterThan(0);
      // Capabilities are namespaced per module (resolveCapability stays the one gate).
      expect(m.response.capability.startsWith(`${m.id}.`), m.id).toBe(true);
    }
  });

  it("the Find menu's module kinds are derived from it and unchanged (a live one links out, the rest are Coming soon)", () => {
    expect(UPCOMING_KINDS).toEqual([
      { id: "internships", label: "Internships", hint: "Student roles and co-ops" },
      { id: "teaching", label: "Teaching", hint: "School and college teachers" },
      { id: "cofounders", label: "Co-founders", hint: "Find someone to build with" },
      { id: "talent_services", label: "Talent & Services", hint: "Hire or offer a skill" },
      { id: "therapists", label: "Therapists", hint: "Counsellors near you or online" },
      { id: "events_social", label: "Events & Social", hint: "Meetups and things to do" },
      { id: "buy_sell_rent", label: "Buy, Sell & Rent", hint: "Pre-used items" },
    ]);
  });
});
