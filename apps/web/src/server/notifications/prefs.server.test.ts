import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let pushSent = 1;
const pushes: string[] = [];
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async (_t: string, p: { title: string }) => (pushes.push(p.title), { sent: pushSent })) }));
const mails: string[] = [];
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { subject: string }) => (mails.push(m.subject), { sent: true })) }));
vi.mock("@/server/accountEmail", () => ({ accountEmail: async () => ({ email: "sam@example.com" }) }));
vi.mock("@/server/auth", () => ({ requireSession: async () => ({ tenantId: "t-prefs" }) }));

import { nudge } from "./deliver";
import { GET, PUT } from "@/app/api/notify-prefs/route";
import { DEFAULT_NOTIFY_PREFS } from "@/domain/notifications/prefs";
import { stateStore } from "@/server/state";

const T = "t-prefs";
const put = (prefs: unknown) => PUT(new Request("http://localhost/api/notify-prefs", { method: "PUT", body: JSON.stringify({ prefs }) }));
const message = { category: "recruiter_message" as const, title: "Message from Acme", body: "Hi", href: "/app/recruiters" };
const failure = { category: "scheduled_run_failed" as const, title: "“Daily” didn't finish", body: "x", href: "/app/runs/r" };

beforeEach(async () => {
  pushSent = 1;
  pushes.length = 0;
  mails.length = 0;
  await stateStore.remove(T, "wj.notifyprefs");
  await stateStore.remove(T, "wj.mailed");
});

describe("Notify me about", () => {
  it("reads the defaults, saves a person's choices cleaned, and reads them back", async () => {
    expect((await (await GET()).json()).prefs).toEqual(DEFAULT_NOTIFY_PREFS);
    const saved = (await (await put({ messages: { push: false, email: true }, junk: 1 })).json()).prefs;
    expect(saved).toEqual({ ...DEFAULT_NOTIFY_PREFS, messages: { push: false, email: true } });
    expect((await (await GET()).json()).prefs).toEqual(saved);
  });

  it("decides what each nudge does: push off → email instead; both off → bell only; no topic → push, never email", async () => {
    await put({ messages: { push: false, email: true } });
    expect(await nudge(T, message, { email: { key: "conv:1" } })).toEqual({ pushed: 0, emailed: true });
    expect(pushes).toEqual([]);
    await put({ messages: { push: false, email: false } });
    expect(await nudge(T, message, { email: { key: "conv:2" } })).toEqual({ pushed: 0, emailed: false });
    pushSent = 0;
    expect(await nudge(T, failure, { email: { key: "run:1" } })).toEqual({ pushed: 0, emailed: false });
    expect(pushes).toEqual(["“Daily” didn't finish"]);
    expect(mails).toEqual(["Message from Acme"]);
  });
});
