import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const recorded: unknown[] = [];
let runs: { stored?: Record<string, number>; finishedAt?: string }[] = [];
let setupRunning = false;

vi.mock("@/server/scheduler/store", () => ({ loadScheduler: async () => ({ gateway: { activateWaiting: false, pausedModules: [], dismissed: [] } }), recordCronRun: async () => {} }));
vi.mock("@/server/jobslake/warm", () => ({ refreshGatewayListings: (...a: unknown[]) => refresh(...a) }));
vi.mock("@/server/jobslake/setup", () => ({ setupTodo: async () => ({ items: [] }) }));
vi.mock("./index", () => ({ hostedGateway: () => ({ gateway: { collectDue: async () => [] }, store: { read: async () => new Map() } }) }));
vi.mock("./admin", () => ({ gatewaySourceModules: async () => [] }));
vi.mock("./setupJob", () => ({ handOnSetupJob: async () => {}, jobRunning: () => setupRunning, readSetupJob: async () => null, startSetupJob: async () => ({ ok: false }) }));
vi.mock("./importRuns", () => ({ lastScheduledRunWithin: async () => true, listImportRuns: async () => runs, recentFailures: async () => new Map(), recordImportRun: async (r: unknown) => { recorded.push(r); }, RETRY_AFTER_MS: 86_400_000 }));
vi.mock("./importEmail", () => ({ sendImportEmail: async () => {} }));

import { runGatewayCollection, REFRESH_STALE_MS } from "./collectJob";

describe("a scheduled run right after the last one", () => {
  beforeEach(() => { refresh.mockReset().mockResolvedValue({ stored: { jobs: 5 } }); recorded.length = 0; setupRunning = false; });

  it("still refreshes every module when Find is stale and no Setup job runs", async () => {
    runs = [{ stored: { jobs: 4 }, finishedAt: new Date(Date.now() - REFRESH_STALE_MS - 60_000).toISOString() }];
    const r = await runGatewayCollection("cron", "https://x", async () => {});
    expect(refresh).toHaveBeenCalledWith();
    expect(r.refreshed).toEqual({ jobs: 5 });
    expect(recorded).toHaveLength(1);
  });

  it("skips when Find was refreshed lately", async () => {
    runs = [{ stored: { jobs: 4 }, finishedAt: new Date().toISOString() }];
    const r = await runGatewayCollection("cron", "https://x", async () => {});
    expect(refresh).not.toHaveBeenCalled();
    expect(r.summary).toBe("Ran recently: nothing to do");
  });

  it("leaves the refresh to a running Setup job", async () => {
    runs = [];
    setupRunning = true;
    const r = await runGatewayCollection("cron", "https://x", async () => {});
    expect(refresh).not.toHaveBeenCalled();
    expect(r.summary).toBe("Ran recently · Setup job continuing");
  });
});
