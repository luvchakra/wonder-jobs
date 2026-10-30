import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const mailed = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => (mailed.push(m), { sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string; body: string; href: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string; body: string; href: string }) => (delivered.push({ tenantId, notice }), { pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import { saveService, setServiceStatus } from "@/server/services/listings";
import { orgRequests } from "@/server/services/requests";
import { saveTherapist, setTherapistStatus } from "./listings";
import { cancelMySession, completeMySession, mySessions, orgSessions, practitionerAct, requestSession } from "./sessions";

const pr: Session = { userId: "u-pr", tenantId: "u-pr", email: "asha@calm.test", name: "Asha" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@calm.test" };
const client: Session = { userId: "u-cli", tenantId: "u-cli", email: "meera@example.com" };
const other: Session = { userId: "u-oth", tenantId: "u-oth", email: "someone@example.com" };
const TODAY = "2026-11-01";
const L = { title: "Counselling for work stress", description: "I work with adults on stress, relationships and career change, in short sessions.", modes: ["online"], languages: ["English"], focus: ["Stress & anxiety"], feeMin: 1500, sessionMinutes: 50 };
const ASK = { mode: "online", date: "2026-11-03", slot: "evening", phone: "98765 43210" };
const policy = (t: string, p: Record<string, string>) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), ...p }, defaultLevel: "guided" } as never);

beforeEach(async () => {
  resetTablesForTests();
  mailed.length = 0;
  delivered.length = 0;
  await policy(client.tenantId, { "therapists.book": "automatic" });
});

async function listed() {
  const { org } = await H.createWorkspace(pr, { name: "Calm Pune" });
  const p = await saveTherapist(pr, org.id, L);
  await setTherapistStatus(pr, org.id, p.id, "open");
  return { orgId: org.id, listingId: p.id };
}
const ask = (listingId: string, s = client, extra: Record<string, unknown> = {}) => requestSession(s, { listingId, name: "Meera Iyer", request: ASK, ...extra }, TODAY);

describe("a session: request, confirm, held", () => {
  it("runs end to end; the client's contact reaches the practitioner only once confirmed; notices name no therapy", async () => {
    const { orgId, listingId } = await listed();
    const out = await ask(listingId);
    await out.notify();
    expect(mailed.map((m) => m.to)).toEqual(["asha@calm.test"]);
    let [seen] = await orgSessions(pr, orgId);
    expect(seen).toMatchObject({ name: "Meera Iyer", status: "requested", request: { mode: "online", date: "2026-11-03", slot: "evening" } });
    expect(seen.email).toBeUndefined();
    expect(seen.phone).toBeUndefined();
    expect(JSON.stringify(seen.request)).not.toContain("98765");

    await practitionerAct(pr, orgId, out.id, { action: "confirm", session: { date: "2026-11-03", time: "18:30", minutes: 50, where: "https://meet.example/x" } }, TODAY);
    [seen] = await orgSessions(pr, orgId);
    expect(seen).toMatchObject({ status: "confirmed", email: "meera@example.com", phone: "98765 43210", deal: { session: { time: "18:30", where: "https://meet.example/x" } } });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ tenantId: client.tenantId, notice: { module: "therapists", title: "Calm Pune replied" } });
    expect(`${delivered[0].notice.title} ${delivered[0].notice.body}`).not.toMatch(/therap|session|18:30/i);

    const [mine] = await mySessions(client);
    expect(mine).toMatchObject({ status: "confirmed", practitioner: "Calm Pune", deal: { session: { date: "2026-11-03" } } });
    // Held only once it has started.
    await expect(practitionerAct(pr, orgId, out.id, { action: "held" })).rejects.toMatchObject({ status: 409 });
  });

  it("decline takes a chosen reason only; then the client can ask again", async () => {
    const { orgId, listingId } = await listed();
    const out = await ask(listingId);
    await expect(ask(listingId)).rejects.toMatchObject({ status: 409 });
    await practitionerAct(pr, orgId, out.id, { action: "decline", reason: "full" });
    expect((await mySessions(client))[0]).toMatchObject({ status: "declined", deal: { reason: "full" } });
    await expect(practitionerAct(pr, orgId, out.id, { action: "decline", reason: "full" })).rejects.toMatchObject({ status: 409 });
    await ask(listingId);
    expect(await mySessions(client)).toHaveLength(2);
  });

  it("the client cancels before it starts; the practitioner is emailed", async () => {
    const { listingId } = await listed();
    const out = await ask(listingId);
    const c = await cancelMySession(client, out.id);
    await c.notify();
    expect((await mySessions(client))[0]).toMatchObject({ status: "cancelled", deal: { cancelledBy: "client" } });
    expect(mailed.some((m) => /Cancelled/.test(m.subject))).toBe(true);
    await expect(cancelMySession(client, out.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("completing a session", () => {
  it("the client can mark it completed only once it has started; then the practitioner can't mark it again", async () => {
    const { orgId, listingId } = await listed();
    const out = await ask(listingId);
    await expect(completeMySession(client, out.id)).rejects.toMatchObject({ status: 409 });
    await practitionerAct(pr, orgId, out.id, { action: "confirm", session: { date: "2026-11-03", time: "18:30", minutes: 50 } }, TODAY);
    await expect(completeMySession(client, out.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("started") });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-03T14:00:00Z"));
      await expect(completeMySession(other, out.id)).rejects.toMatchObject({ status: 404 });
      await expect(completeMySession(client, out.id)).resolves.toEqual({ status: "held" });
      expect((await mySessions(client))[0]).toMatchObject({ status: "held" });
      await expect(completeMySession(client, out.id)).rejects.toMatchObject({ status: 409 });
      await expect(practitionerAct(pr, orgId, out.id, { action: "held" })).rejects.toMatchObject({ status: 409 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("gates and isolation", () => {
  it("therapists.book: Off refuses, Ask me needs the client's Send, a missing policy fails closed to asking", async () => {
    const { listingId } = await listed();
    await policy(client.tenantId, { "therapists.book": "off" });
    await expect(ask(listingId)).rejects.toMatchObject({ status: 403 });
    await policy(client.tenantId, { "therapists.book": "ask" });
    await expect(ask(listingId)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("then press Send") });
    await ask(listingId, client, { confirmed: true });
    await expect(ask(listingId, other)).rejects.toMatchObject({ status: 409 });
    await ask(listingId, other, { confirmed: true });
  });

  it("a closed listing takes no request; a way of meeting it doesn't offer is refused", async () => {
    const { orgId, listingId } = await listed();
    await expect(ask(listingId, client, { request: { ...ASK, mode: "in_person" } })).rejects.toMatchObject({ status: 400 });
    await setTherapistStatus(pr, orgId, listingId, "closed");
    await expect(ask(listingId)).rejects.toMatchObject({ status: 404 });
  });

  it("each side sees only its own: other clients, other workspaces and roles that may not decide", async () => {
    const { orgId, listingId } = await listed();
    const out = await ask(listingId);
    expect(await mySessions(other)).toEqual([]);
    await expect(cancelMySession(other, out.id)).rejects.toMatchObject({ status: 404 });
    const { org: theirs } = await H.createWorkspace(other, { name: "Other Practice" });
    await expect(practitionerAct(other, theirs.id, out.id, { action: "decline", reason: "fit" })).rejects.toMatchObject({ status: 404 });
    await expect(orgSessions(other, orgId)).rejects.toMatchObject({ status: 403 });
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() } as never);
    expect(await orgSessions(recruiter, orgId)).toHaveLength(1);
    await expect(practitionerAct(recruiter, orgId, out.id, { action: "decline", reason: "fit" })).rejects.toMatchObject({ status: 403 });
  });

  it("never mixes with Talent & Services' requests in the same workspace", async () => {
    const { orgId, listingId } = await listed();
    const svc = await saveService(pr, orgId, { title: "Split AC service", description: "Wet service of units, gas check and a test run for your split AC.", lane: "local", category: "AC service & repair", location: "Pune", areas: ["Kothrud"], priceKind: "visit", priceMin: 599 });
    await setServiceStatus(pr, orgId, svc.id, "open");
    await ask(listingId);
    expect(await orgRequests(pr, orgId)).toEqual([]);
    // A services listing id isn't a therapists listing.
    await expect(ask(svc.id)).rejects.toMatchObject({ status: 404 });
  });
});
