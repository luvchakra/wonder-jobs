import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string; body: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string; body: string }) => (delivered.push({ tenantId, notice }), { pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import { goingEvents, runEventReminders } from "./calendar";
import { saveEvent, setEventStatus } from "./listings";
import { rsvp } from "./rsvp";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const ann: Session = { userId: "u-ann", tenantId: "u-ann", email: "ann@example.com" };
const bob: Session = { userId: "u-bob", tenantId: "u-bob", email: "bob@example.com" };
const auto = (t: string) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "events.rsvp": "automatic", "events.promote": "automatic" }, defaultLevel: "guided" } as never);
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(async () => {
  resetTablesForTests();
  delivered.length = 0;
  await auto(ann.tenantId);
  await auto(bob.tenantId);
});

async function post(title: string, startsAt: string, capacity?: number) {
  const { org } = await H.createWorkspace(host, { name: `Group ${title}` });
  const { posting } = await saveEvent(host, org.id, { title, description: "Bring a game or borrow one; all levels welcome.", location: "Pune", startsAt, capacity });
  await setEventStatus(host, org.id, posting.id, "open");
  return posting.id;
}

describe("the calendar feed", () => {
  it("carries only the events this person is going to, never another person's or a waitlist place", async () => {
    const id = await post("Board games", inHours(72), 1);
    await rsvp(ann, { listingId: id, name: "Ann" });
    await rsvp(bob, { listingId: id, name: "Bob" });
    expect((await goingEvents(ann.tenantId, "https://x.test")).map((e) => e.summary)).toEqual(["Board games"]);
    expect(await goingEvents(bob.tenantId, "https://x.test")).toEqual([]);
    expect(await goingEvents("someone-else", "https://x.test")).toEqual([]);
  });
});

describe("the day-before reminder", () => {
  it("is sent once per RSVP to those going, only for events starting within a day, tagged for Events", async () => {
    const soon = await post("Tomorrow's run", inHours(10));
    await post("Next month", inHours(24 * 30));
    await rsvp(ann, { listingId: soon, name: "Ann" });
    const first = await runEventReminders(new Date(), Date.now() + 50_000);
    expect(first).toEqual({ raised: 1, failures: 0 });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ tenantId: "u-ann", notice: { module: "events", title: "An event is coming up" } });
    // Running the pass again never repeats it.
    expect(await runEventReminders(new Date(), Date.now() + 50_000)).toEqual({ raised: 0, failures: 0 });
    expect(delivered).toHaveLength(1);
  });

  it("does not remind someone on the waitlist, or about an event that has started", async () => {
    const id = await post("Full run", inHours(10), 1);
    await rsvp(ann, { listingId: id, name: "Ann" });
    await rsvp(bob, { listingId: id, name: "Bob" });
    await runEventReminders(new Date(), Date.now() + 50_000);
    expect(delivered.map((d) => d.tenantId)).toEqual(["u-ann"]);
    delivered.length = 0;
    expect(await runEventReminders(new Date(Date.now() + 48 * 3_600_000), Date.now() + 50_000)).toEqual({ raised: 0, failures: 0 });
  });
});
