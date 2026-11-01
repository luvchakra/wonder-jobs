import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { BUILTIN_SOURCES, listSources } from "@/server/jobslake/registry";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import { saveEvent, setEventStatus } from "./listings";
import { rsvp } from "./rsvp";
import { searchEvents } from "./search";
import { EVENTS_SOURCES, runEventsSource } from "./sources";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const guest: Session = { userId: "u-g", tenantId: "u-g", email: "g@example.com" };
const automatic = () => writeClientState(guest.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "events.rsvp": "automatic", "events.promote": "automatic" }, defaultLevel: "guided" } as never);
const soon = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

beforeEach(() => {
  // No real service: outside sources (developers.events) answer with nothing.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } })));
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setJobsLakeStore(undefined);
});

async function post(title: string, capacity?: number) {
  const { org } = await H.createWorkspace(host, { name: "Pune Games" });
  const { posting } = await saveEvent(host, org.id, { title, description: "Bring a game or borrow one; all levels welcome.", location: "Pune", startsAt: soon(), capacity });
  await setEventStatus(host, org.id, posting.id, "open");
  return { orgId: org.id, id: posting.id };
}

describe("the Events WorksLake dataset", () => {
  it("is its own: its source feeds only Events, and Jobs lists none of it", async () => {
    for (const s of EVENTS_SOURCES) expect(s.module).toBe("events");
    expect((await listSources("events")).map((s) => s.id)).toEqual(EVENTS_SOURCES.map((s) => s.id));
    expect((await listSources("jobs")).map((s) => s.id)).toEqual(expect.not.arrayContaining(EVENTS_SOURCES.map((s) => s.id)));
    expect(BUILTIN_SOURCES.some((s) => s.module === "events")).toBe(false);
  });

  it("an event is found by the person's words, with seats left and who is going never shown", async () => {
    await post("Sunday board games", 1);
    const { jobs } = await runEventsSource(EVENTS_SOURCES[0], { query: "board games", locations: [] });
    expect(jobs).toHaveLength(1);
    const r = await searchEvents({ query: "board games", places: [] });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ title: "Sunday board games", seatsLeft: 1, waitlisted: 0 });
    expect(r.sources.find((x) => x.name === "WonderWorks events")).toMatchObject({ state: "ok", count: 1 });
  });

  it("seats left follow the RSVPs, and a closed event isn't found", async () => {
    const { orgId, id } = await post("Pottery night", 1);
    await automatic();
    await rsvp(guest, { listingId: id, name: "Guest" });
    const r = await searchEvents({ query: "pottery", places: [] });
    expect(r.results[0]).toMatchObject({ seatsLeft: 0, waitlisted: 0 });
    expect(JSON.stringify(r)).not.toMatch(/g@example\.com|u-g/);
    await setEventStatus(host, orgId, id, "closed");
    expect((await searchEvents({ query: "pottery", places: [] })).results).toEqual([]);
  });
});
