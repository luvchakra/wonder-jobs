import { describe, expect, it } from "vitest";
import type { Notification } from "./types";
import { addNotification, NOTIFICATION_ACTION, notificationModule, notificationsFor, visibleNotifications } from "./notifications";

const n = (over: Partial<Notification> = {}): Notification => ({ id: "a", at: "2026-10-01T00:00:00Z", category: "workflow_requires_input", title: "Wonder needs your input", body: "1 prepared application is ready.", href: "/app/runs/r1", read: false, ...over });

describe("addNotification", () => {
  it("replaces an unread notification that says the same thing, keeping the newest link", () => {
    const list = addNotification([n()], { category: "workflow_requires_input", title: "Wonder needs your input", body: "1 prepared application is ready.", href: "/app/runs/r2" }, "b", "2026-10-02T00:00:00Z", 50);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "b", href: "/app/runs/r2", read: false });
  });

  it("keeps read history and different messages", () => {
    const list = addNotification([n({ id: "old", read: true }), n({ id: "other", body: "Something else" })], { category: "workflow_requires_input", title: "Wonder needs your input", body: "1 prepared application is ready.", href: "/app/runs/r3" }, "c", "2026-10-02T00:00:00Z", 50);
    expect(list.map((x) => x.id)).toEqual(["c", "old", "other"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 5 }, (_, i) => n({ id: `x${i}`, body: `m${i}` }));
    expect(addNotification(many, { category: "follow_up_due", title: "t", body: "b", href: "/" }, "new", "2026-10-03T00:00:00Z", 3)).toHaveLength(3);
  });
});

describe("visibleNotifications", () => {
  it("shows one per distinct message, newest first", () => {
    const list = [n({ id: "1", at: "2026-09-01T00:00:00Z" }), n({ id: "2", at: "2026-10-01T00:00:00Z" }), n({ id: "3", at: "2026-09-15T00:00:00Z", body: "different" })];
    expect(visibleNotifications(list).map((x) => x.id)).toEqual(["2", "3"]);
  });
});

it("every category has an action label", () => {
  for (const label of Object.values(NOTIFICATION_ACTION)) expect(label.length).toBeGreaterThan(0);
});

describe("the browser's and the server's copies of the bell", () => {
  it("keep every notification once, read if either says so, newest first, capped", async () => {
    const { mergeNotifications, mergeReminded } = await import("./notifications");
    const browser = [n({ id: "seen", at: "2026-10-02T00:00:00Z", read: true }), n({ id: "mine", at: "2026-10-03T00:00:00Z", body: "x" })];
    const server = [n({ id: "seen", at: "2026-10-02T00:00:00Z", read: false }), n({ id: "reminder", at: "2026-10-04T00:00:00Z", category: "interview_upcoming", body: "y" })];
    const merged = mergeNotifications(browser, server);
    expect(merged.map((x) => [x.id, x.read])).toEqual([["reminder", false], ["mine", false], ["seen", true]]);
    expect(mergeNotifications(browser, server, 2).map((x) => x.id)).toEqual(["reminder", "mine"]);
    expect(mergeReminded(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeNotifications(undefined, undefined)).toEqual([]);
  });
});

describe("notifications by module", () => {
  it("a notification belongs to the module it names, else the one its link opens, else Jobs; the AI provider's is the account's", () => {
    expect(notificationModule(n({ href: "/app/m/internships/pipeline" }))).toBe("internships");
    expect(notificationModule(n({ href: "/app/somewhere", module: "teaching" }))).toBe("teaching");
    expect(notificationModule(n({ href: "/app/runs/r1" }))).toBe("jobs");
    expect(notificationModule(n({ category: "application_status", href: "/app/applications/a1" }))).toBe("jobs");
    expect(notificationModule(n({ category: "provider_issue", href: "/app/settings/ai" }))).toBeNull();
  });

  it("each module's bell shows its own and the account's, never another module's", () => {
    const list = [n({ id: "j", href: "/app/jobs" }), n({ id: "i", href: "/app/m/internships/pipeline", title: "Offer" }), n({ id: "p", category: "provider_issue", href: "/app/settings/ai" })];
    expect(notificationsFor(list, "jobs").map((x) => x.id)).toEqual(["j", "p"]);
    expect(notificationsFor(list, "internships").map((x) => x.id)).toEqual(["i", "p"]);
    expect(notificationsFor(list, "teaching").map((x) => x.id)).toEqual(["p"]);
  });
});
