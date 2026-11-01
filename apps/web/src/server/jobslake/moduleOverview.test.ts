import { describe, expect, it } from "vitest";
import { moduleOverview, type SourceView } from "./views";
import { MODULES } from "@/modules/registry";

const view = (id: string, moduleLabel: string, status: string, health?: string, available = true) => ({ id, moduleLabel, status, available, health: health ? { state: health } : undefined }) as unknown as SourceView;

describe("the admin Overview's module rows", () => {
  it("gives every module a row, counting only its own live sources and runs", () => {
    const views = [view("a", "Jobs", "active", "healthy"), view("b", "Jobs", "paused"), view("c", "Teaching", "degraded", "down"), view("d", "Events & Social", "active", undefined, false)];
    const runs = [
      { sourceId: "a", outcome: "ok", retrieved: 40 },
      { sourceId: "c", outcome: "timeout", retrieved: 0 },
      { sourceId: "c", outcome: "ok", retrieved: 12 },
      { sourceId: "zzz", outcome: "ok", retrieved: 99 },
    ];
    const rows = moduleOverview(views, runs);
    expect(rows.map((r) => r.label)).toEqual(MODULES.map((m) => m.label));
    expect(rows.find((r) => r.label === "Jobs")).toMatchObject({ live: 1, healthy: 1, runs24h: 1, retrieved24h: 40 });
    expect(rows.find((r) => r.label === "Teaching")).toMatchObject({ live: 1, down: 1, runs24h: 2, failed24h: 1, retrieved24h: 12 });
    expect(rows.find((r) => r.label === "Events & Social")).toMatchObject({ live: 1, needsSetup: 1, runs24h: 0 });
    expect(rows.find((r) => r.label === "Internships")).toMatchObject({ live: 0, runs24h: 0, retrieved24h: 0 });
  });
});
