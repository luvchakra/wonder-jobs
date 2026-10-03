import { describe, expect, it } from "vitest";
import type { Notification } from "./types";
import { addNotification, NOTIFICATION_ACTION, visibleNotifications } from "./notifications";

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
