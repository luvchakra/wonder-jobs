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
import { notificationModule } from "@/domain/career/notifications";
import * as H from "@/server/hiring";
import { openEventPosts, orgEvents, saveEvent, seatCounts, setEventStatus } from "./listings";
import { cancelMyRsvp, markAttendee, myRsvps, orgRsvps, rsvp } from "./rsvp";
import { setCapacity } from "./seats";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test", name: "Host" };
const nobody: Session = { userId: "u-nb", tenantId: "u-nb", email: "nb@example.com" };
const people = Array.from({ length: 5 }, (_, i): Session => ({ userId: `u-p${i}`, tenantId: `u-p${i}`, email: `p${i}@example.com` }));
const policy = (t: string, p: Record<string, string>) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), ...p }, defaultLevel: "guided" } as never);
const soon = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
const E = { title: "Sunday board games", description: "Bring a game or borrow one; all levels welcome.", location: "Koregaon Park, Pune", capacity: 2 };

beforeEach(async () => {
  resetTablesForTests();
  delivered.length = 0;
  for (const p of people) await policy(p.tenantId, { "events.rsvp": "automatic", "events.promote": "automatic", "events.cancel": "automatic" });
});

async function listed(capacity: number | null = 2, startsAt = soon()) {
  const { org } = await H.createWorkspace(host, { name: "Pune Games" });
  const { posting } = await saveEvent(host, org.id, { ...E, capacity: capacity ?? undefined, startsAt });
  await setEventStatus(host, org.id, posting.id, "open");
  return { orgId: org.id, id: posting.id };
}
const go = (id: string, s: Session, extra: Record<string, unknown> = {}) => rsvp(s, { listingId: id, name: "Pat", ...extra });
const statuses = async (orgId: string) => Object.fromEntries((await orgRsvps(host, orgId)).map((a) => [a.email.split("@")[0], a.status]));

describe("capacity and the waitlist", () => {
  it("fills the seats, then waitlists, and a double tap takes no second seat", async () => {
    const { orgId, id } = await listed();
    expect(await go(id, people[0])).toMatchObject({ status: "going", repeated: false });
    expect(await go(id, people[0])).toMatchObject({ status: "going", repeated: true });
    expect((await go(id, people[1])).status).toBe("going");
    expect(await go(id, people[2])).toMatchObject({ status: "waitlist", place: 1 });
    expect(await go(id, people[3])).toMatchObject({ status: "waitlist", place: 2 });
    expect(await statuses(orgId)).toEqual({ p0: "going", p1: "going", p2: "waitlist", p3: "waitlist" });
    expect((await seatCounts([id])).get(id)).toEqual({ going: 2, waiting: 2 });
  });

  it("many taps at once never exceed the capacity and never double-book a person", async () => {
    const { orgId, id } = await listed(3);
    await Promise.all([...people, ...people].map((p) => go(id, p)));
    const all = await orgRsvps(host, orgId);
    expect(all).toHaveLength(5);
    expect(all.filter((a) => a.status === "going")).toHaveLength(3);
    expect(all.filter((a) => a.status === "waitlist")).toHaveLength(2);
  });

  it("a cancel promotes the oldest waiting person once, even if cancelled twice at once; they are told", async () => {
    const { orgId, id } = await listed();
    for (const p of people.slice(0, 4)) await go(id, p);
    const mine = (await myRsvps(people[0]))[0];
    await Promise.all([cancelMyRsvp(people[0], mine.id), cancelMyRsvp(people[0], mine.id).catch(() => undefined)]);
    expect(await statuses(orgId)).toEqual({ p0: "cancelled", p1: "going", p2: "going", p3: "waitlist" });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ tenantId: "u-p2", notice: { module: "events", title: "A seat opened" } });
    expect(notificationModule({ category: "application_status", href: "/x", module: delivered[0].notice.module })).toBe("events");
  });

  it("raising the capacity promotes the waitlist; lowering it removes no one", async () => {
    const { orgId, id } = await listed();
    for (const p of people.slice(0, 4)) await go(id, p);
    expect(await setCapacity({ listingId: id, orgId, capacity: 3 })).toHaveLength(1);
    expect(await setCapacity({ listingId: id, orgId, capacity: 1 })).toEqual([]);
    expect(Object.values(await statuses(orgId)).filter((s) => s === "going")).toHaveLength(3);
    expect(await setCapacity({ listingId: id, orgId, capacity: undefined })).toHaveLength(1);
  });

  it("no capacity means no limit", async () => {
    const { id } = await listed(null);
    for (const p of people) expect((await go(id, p)).status).toBe("going");
  });

  it("a person can RSVP again after cancelling", async () => {
    const { id } = await listed();
    const first = await go(id, people[0]);
    await cancelMyRsvp(people[0], first.id);
    expect(await go(id, people[0])).toMatchObject({ status: "going", repeated: false });
  });
});

describe("the gates", () => {
  it("RSVP follows the person's saved setting: off refuses, ask needs their confirmation, no saved setting asks", async () => {
    const { id } = await listed();
    await policy(people[0].tenantId, { "events.rsvp": "off" });
    await expect(go(id, people[0])).rejects.toMatchObject({ status: 403 });
    await policy(people[0].tenantId, { "events.rsvp": "ask" });
    await expect(go(id, people[0])).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/then press RSVP/) });
    expect((await go(id, people[0], { confirmed: true })).status).toBe("going");
    await expect(go(id, nobody)).rejects.toMatchObject({ status: 409 });
  });

  it("joining a waitlist needs the person's consent to a seat from it (events.promote), failing closed", async () => {
    const { id } = await listed(1);
    await go(id, people[0]);
    await policy(people[1].tenantId, { "events.promote": "off" });
    await expect(go(id, people[1])).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/full/) });
    await policy(people[1].tenantId, { "events.promote": "ask" });
    await expect(go(id, people[1])).rejects.toMatchObject({ status: 409 });
    expect((await go(id, people[1], { confirmed: true })).status).toBe("waitlist");
  });

  it("an event that started or isn't open takes no RSVP", async () => {
    const { orgId, id } = await listed();
    await setEventStatus(host, orgId, id, "closed");
    await expect(go(id, people[0])).rejects.toMatchObject({ status: 404 });
    expect(await openEventPosts()).toHaveLength(0);
  });
});

describe("tenant and org filters", () => {
  it("an attendee sees and cancels only their own RSVPs", async () => {
    const { id } = await listed();
    const a = await go(id, people[0]);
    await go(id, people[1]);
    expect((await myRsvps(people[1])).map((r) => r.id)).not.toContain(a.id);
    await expect(cancelMyRsvp(people[1], a.id)).rejects.toMatchObject({ status: 404 });
    expect((await myRsvps(people[0]))[0]).toMatchObject({ status: "going", organiser: "Pune Games" });
  });

  it("only that workspace's members read its attendees or mark them", async () => {
    const { orgId, id } = await listed();
    const a = await go(id, people[0]);
    await expect(orgRsvps(nobody, orgId)).rejects.toBeTruthy();
    await expect(markAttendee(nobody, orgId, a.id, "cancelled")).rejects.toBeTruthy();
    const other = await H.createWorkspace(nobody, { name: "Other Org" });
    await expect(markAttendee(nobody, other.org.id, a.id, "cancelled")).rejects.toMatchObject({ status: 404 });
    await expect(orgEvents(nobody, orgId)).rejects.toBeTruthy();
    expect((await orgEvents(host, orgId))[0]).toMatchObject({ id, status: "open" });
  });

  it("the organiser removes an attendee before the event (the seat is freed) and marks attendance after it", async () => {
    const { orgId, id } = await listed(1);
    const a = await go(id, people[0]);
    await go(id, people[1]);
    await expect(markAttendee(host, orgId, a.id, "attended")).rejects.toMatchObject({ status: 409 });
    await markAttendee(host, orgId, a.id, "cancelled");
    expect(await statuses(orgId)).toEqual({ p0: "cancelled", p1: "going" });
    expect(delivered.map((d) => d.notice.title).sort()).toEqual(["A seat opened", "Your RSVP was removed"]);
  });

  it("after the start the organiser marks attended or no-show; neither frees a seat for a waiting person", async () => {
    const { orgId, id } = await listed(1, new Date(Date.now() + 60_000).toISOString());
    const a = await go(id, people[0]);
    // Move the start into the past without changing anything else.
    const { table } = await import("@/server/db/table");
    await table<{ id: string; attrs: Record<string, unknown> }>("listings").update({ id }, { attrs: { startsAt: new Date(Date.now() - 1000).toISOString(), capacity: 1, online: false, tags: [] } });
    await expect(cancelMyRsvp(people[0], a.id)).rejects.toMatchObject({ status: 409 });
    await expect(go(id, people[1])).rejects.toMatchObject({ status: 409 });
    await markAttendee(host, orgId, a.id, "no_show");
    expect((await orgRsvps(host, orgId))[0].status).toBe("no_show");
  });
});
