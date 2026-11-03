import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import { sharedListing } from "@/server/share/listing";
import { saveEvent, setEventStatus } from "./listings";
import { rsvp } from "./rsvp";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const guest: Session = { userId: "u-guest", tenantId: "u-guest", email: "secret.guest@example.com", name: "Secret Guest" };
const soon = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

beforeEach(() => resetTablesForTests());

async function openEvent(capacity = 2) {
  const { org } = await H.createWorkspace(host, { name: "Pune Games" });
  const { posting } = await saveEvent(host, org.id, { title: "Sunday board games", description: "Bring a game or borrow one; all levels welcome.", location: "Baner, Pune", startsAt: soon(), capacity });
  await setEventStatus(host, org.id, posting.id, "open");
  return { orgId: org.id, id: posting.id };
}

describe("an event's public share page, as anyone sees it", () => {
  it("shows an open event with its organiser, place and seats left, and its own public link", async () => {
    const { id } = await openEvent();
    const l = await sharedListing("events", `ws_${id}`);
    expect(l).toMatchObject({ module: "events", noun: "event", title: "Sunday board games", url: `/s/events/ws_${id}` });
    expect(l!.facts?.at(-1)).toBe("Pune Games");
    expect(l!.lines).toContain("Seats: 2 of 2 seats left");
    expect(l!.originalUrl).toBeUndefined();
  });

  it("follows the seats as they go, and never says who is going", async () => {
    const { id } = await openEvent();
    await writeClientState(guest.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "events.rsvp": "automatic" }, defaultLevel: "guided" });
    await rsvp(guest, { listingId: id, name: "Secret Guest" });
    const l = await sharedListing("events", `ws_${id}`);
    expect(l!.lines).toContain("Seats: 1 of 2 seats left");
    const text = JSON.stringify(l);
    expect(text).not.toContain("Secret Guest");
    expect(text).not.toContain("secret.guest");
  });

  it("is gone once the event closes, and an unknown or another module's id shows nothing", async () => {
    const { orgId, id } = await openEvent();
    expect(await sharedListing("events", `ws_${id}`)).not.toBeNull();
    expect(await sharedListing("teaching", `ws_${id}`)).toBeNull();
    expect(await sharedListing("events", "ws_nope")).toBeNull();
    expect(await sharedListing("events", "ow_nope")).toBeNull();
    await setEventStatus(host, orgId, id, "closed");
    expect(await sharedListing("events", `ws_${id}`)).toBeNull();
  });
});
