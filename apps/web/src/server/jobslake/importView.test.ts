import { describe, expect, it } from "vitest";
import type { GatewaySourceRow } from "@/server/gateway/admin";
import { moduleRows } from "./importView";
import type { SetupItem } from "./setup";
import type { SourceView } from "./views";

const view = (id: string, module: string, status: string, over: Partial<SourceView> = {}) => ({ id, name: id, module, status, statusLabel: status, available: true, health: null, ...over }) as unknown as SourceView;
const gw = (id: string, module: string, over: Partial<GatewaySourceRow> = {}): GatewaySourceRow => ({ id, name: id, kind: "json_api", modules: [module], host: "x", enabled: false, termsPending: false, geography: [], listings: 0, lastSuccessAt: null, lastError: null, nextRunAt: null, intervalMinutes: 60, lastTest: null, crawl: null, ...over });
const item = (id: string, module: string, need: SetupItem["need"], over: Partial<SetupItem> = {}): SetupItem => ({ id, name: id, module, moduleLabel: module, dataType: "x", need, detail: `needs ${need}`, action: { label: "Open", href: "/x" }, countries: [], ...over });

describe("Import page: a module's sources as rows with one state and one action (2026-11-02)", () => {
  it("lists live, waiting and needs-you rows, in that order, from WorksLake sources, gateway sources and Setup items", () => {
    const views = [view("thp_wonderworks", "therapists", "active"), view("thp_osm", "therapists", "active", { health: { state: "down" } as SourceView["health"] }), view("thp_off", "therapists", "paused"), view("works_gateway_therapists", "therapists", "active"), view("adzuna", "jobs", "active")];
    const gateway = [gw("src_a", "therapists", { enabled: true, listings: 10 }), gw("src_b", "therapists", { lastTest: { at: "", ok: true, discovered: 7, valid: 7 } }), gw("src_c", "services")];
    const items = [item("gateway:src_b", "therapists", "activate", { run: { kind: "activate", sourceId: "src_b" } }), item("catalogue:osm.json", "therapists", "add", { run: { kind: "add", file: "osm.json" } }), item("decision:osm-server", "therapists", "decision", { decision: true }), item("adzuna", "jobs", "key")];
    const rows = moduleRows("therapists", views, gateway, items);
    expect(rows.map((r) => [r.id, r.state, r.action?.kind])).toEqual([
      ["decision:osm-server", "needs_you", "decide"],
      ["catalogue:osm.json", "waiting", "run"],
      ["gateway:src_b", "waiting", "run"],
      ["thp_osm", "down", "link"],
      ["gateway:src_a", "live", "pause"],
      ["thp_wonderworks", "live", "link"],
      ["thp_off", "off", "link"],
    ]);
    expect(rows.find((r) => r.id === "gateway:src_a")?.listings).toBe(10);
    expect(rows.some((r) => r.id === "works_gateway_therapists")).toBe(false); // the bridge is automatic, not a row
    expect(rows.some((r) => r.id === "adzuna" || r.id === "gateway:src_c")).toBe(false); // another module's
  });

  it("a partner's row asks for its list, then offers Activate once one is uploaded", () => {
    expect(moduleRows("events", [], [gw("src_p", "events", { kind: "upload" })], [])[0]).toMatchObject({ kind: "Partner", state: "needs_you", action: { kind: "upload" } });
    expect(moduleRows("events", [], [gw("src_p", "events", { kind: "upload", listings: 40 })], [])[0]).toMatchObject({ state: "waiting", action: { kind: "activate" } });
    expect(moduleRows("events", [], [gw("src_p", "events", { kind: "upload", listings: 40, enabled: true })], [])[0]).toMatchObject({ state: "live", action: { kind: "upload" } });
  });

  it("a WorksLake source that needs a key or terms is 'needs you' with the Setup list's own link", () => {
    const rows = moduleRows("jobs", [view("adzuna", "jobs", "active")], [], [item("adzuna", "jobs", "key", { action: { label: "Set key", href: "/platform/jobs-lake/keys" } })]);
    expect(rows[0]).toMatchObject({ state: "needs_you", action: { kind: "link", href: "/platform/jobs-lake/keys", label: "Set key" } });
  });
});
