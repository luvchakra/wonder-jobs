import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let pushSent = 0;
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: pushSent })) }));
const mails: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => (mails.push(m), { sent: true })) }));
let email: string | null = "sam@example.com";
vi.mock("@/server/accountEmail", () => ({ accountEmail: async () => (email ? { email, name: "Sam" } : null) }));
let tenant = "t-notify";
vi.mock("@/server/auth", () => ({ requireSession: async () => ({ tenantId: tenant }) }));
vi.mock("@/server/privacy/records", () => ({ isErased: async () => false }));

import { deliver, nudge, nudgeChosen } from "./deliver";
import { stateStore } from "@/server/state";
import { PUT } from "@/app/api/state/route";
import { GET as inbox } from "@/app/api/inbox/route";

const T = "t-notify";
const career = (notifications: unknown[], reminded: string[] = []) => ({ state: { notifications, reminded, dna: { name: "Sam" } }, version: 7 });
const notice = { category: "recruiter_message" as const, title: "Message from Acme", body: "Hi Sam, are you open to a chat?", href: "/app/recruiters?c=c1" };

beforeEach(async () => {
  pushSent = 0;
  email = "sam@example.com";
  tenant = T;
  mails.length = 0;
  await stateStore.remove(T, "wj.career");
  await stateStore.remove(T, "wj.mailed");
});

describe("telling someone something from the server", () => {
  it("puts it in their bell, and emails it when no push reached them — once per key and window", async () => {
    await stateStore.put(T, "wj.career", career([]));
    const now = new Date("2026-10-22T10:00:00Z");
    expect(await deliver(T, notice, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, now)).toEqual({ pushed: 0, emailed: true });
    const doc = (await stateStore.get(T, "wj.career"))?.state as { state: { notifications: { title: string; read: boolean }[]; dna: unknown }; version: number };
    expect(doc.state.notifications[0]).toMatchObject({ title: "Message from Acme", read: false });
    // The rest of the document and its version stay as they were.
    expect(doc.state.dna).toEqual({ name: "Sam" });
    expect(doc.version).toBe(7);
    expect(mails[0]).toMatchObject({ to: "sam@example.com", subject: "Message from Acme" });
    expect(mails[0].text).toContain("/app/recruiters?c=c1");
    // A second message in the same thread ten minutes later: in the bell, no second email.
    expect((await deliver(T, { ...notice, body: "Following up" }, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, new Date("2026-10-22T10:10:00Z"))).emailed).toBe(false);
    expect((await deliver(T, { ...notice, body: "Again" }, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, new Date("2026-10-22T10:45:00Z"))).emailed).toBe(true);
    expect(mails).toHaveLength(2);
  });

  it("doesn't email when a push reached them, when there's no sign-in email, or a key already went", async () => {
    pushSent = 1;
    expect(await nudge(T, notice, { email: { key: "reminder-1" } })).toEqual({ pushed: 1, emailed: false });
    pushSent = 0;
    email = null;
    expect((await nudge(T, notice, { email: { key: "reminder-1" } })).emailed).toBe(false);
    email = "sam@example.com";
    expect((await nudge(T, notice, { email: { key: "reminder-1" } })).emailed).toBe(true);
    expect((await nudge(T, notice, { email: { key: "reminder-1" } })).emailed).toBe(false);
    expect(mails).toHaveLength(1);
  });
});

describe("saving the career document from a tab that was open all night", () => {
  it("keeps what the server added to the bell and the reminders it raised, and what the tab marked read", async () => {
    const at = (h: number) => `2026-10-22T0${h}:00:00.000Z`;
    const seen = { id: "n-old", at: at(1), category: "workflow_completed", title: "Search finished", body: "b", href: "/", read: false };
    // The morning job wrote a reminder; the tab still has only the old one, which it has marked read.
    await stateStore.put(T, "wj.career", career([{ id: "n-rem", at: at(7), category: "interview_upcoming", title: "Interview coming up", body: "b", href: "/app/interview-prep", read: false }, seen], ["f-1"]));
    const res = await PUT(new Request("http://localhost/api/state", { method: "PUT", body: JSON.stringify({ docs: { "wj.career": career([{ ...seen, read: true }], []) } }) }));
    expect(res.status).toBe(200);
    const saved = (await stateStore.get(T, "wj.career"))?.state as { state: { notifications: { id: string; read: boolean }[]; reminded: string[] } };
    expect(saved.state.notifications.map((x) => [x.id, x.read])).toEqual([["n-rem", false], ["n-old", true]]);
    expect(saved.state.reminded).toEqual(["f-1"]);
    // And the tab can read it back when the candidate returns.
    expect((await (await inbox()).json()).notifications.map((x: { id: string }) => x.id)).toEqual(["n-rem", "n-old"]);
  });

  it("sends a Calendar reminder each way the candidate picked — push and email both — email once per key", async () => {
    const reminder = { category: "interview_upcoming" as const, title: "Interview coming up — Acme", body: "Round 2", href: "/app/applications/a1/interview" };
    pushSent = 1;
    expect(await nudgeChosen(T, reminder, ["push", "email"], "reminder-f1")).toEqual({ pushed: 1, emailed: true });
    expect(await nudgeChosen(T, reminder, ["push", "email"], "reminder-f1")).toEqual({ pushed: 1, emailed: false });
    expect(await nudgeChosen(T, reminder, ["app"], "reminder-f2")).toEqual({ pushed: 0, emailed: false });
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("email reminder for this on your WonderJobs Calendar");
  });
});
