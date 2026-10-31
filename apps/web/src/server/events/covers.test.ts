import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { coverSrc } from "@/modules/events/domain";
import * as H from "@/server/hiring";
import { orgEvents, saveEvent, setEventStatus } from "./listings";
import { readCover, removeCover, setCover } from "./covers";
import { myRsvps, rsvp } from "./rsvp";
import { searchEvents } from "./search";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const guest: Session = { userId: "u-g", tenantId: "u-g", email: "g@example.com" };
const stranger: Session = { userId: "u-s", tenantId: "u-s", email: "s@example.com" };
// A tiny JPEG with an EXIF segment that carries a location.
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0e]), Buffer.from("Exif\0GPS-12.97N")]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9])]);
const E = { title: "Sunday board games", description: "Bring a game or borrow one; all levels welcome.", location: "Pune", capacity: 5 };

beforeEach(async () => {
  resetTablesForTests();
  await writeClientState(guest.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "events.rsvp": "automatic", "events.promote": "automatic" }, defaultLevel: "guided" } as never);
});

async function posted(open = true) {
  const { org } = await H.createWorkspace(host, { name: "Pune Games" });
  const { posting } = await saveEvent(host, org.id, { ...E, startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
  if (open) await setEventStatus(host, org.id, posting.id, "open");
  return { orgId: org.id, id: posting.id };
}

describe("an event's cover photo", () => {
  it("is stored without its metadata, read back by anyone signed in while the event is open, and shows in the event's terms", async () => {
    const { orgId, id } = await posted();
    const { cover } = await setCover(host, orgId, id, jpeg(), "image/jpeg");
    const read = await readCover(stranger, id);
    expect(read).toMatchObject({ mime: "image/jpeg" });
    expect(read!.bytes.includes(Buffer.from("GPS"))).toBe(false);
    expect((await orgEvents(host, orgId))[0].terms.cover).toBe(cover);
    expect(coverSrc(id, cover)).toBe(`/api/m/events/cover/${id}?v=${cover}`);
    expect(coverSrc(id, undefined)).toBeUndefined();
  });

  it("only a member who may edit sets or removes it, and only in their own workspace", async () => {
    const { orgId, id } = await posted();
    await expect(setCover(stranger, orgId, id, jpeg())).rejects.toMatchObject({ status: 403 });
    const other = await H.createWorkspace(stranger, { name: "Other Org" });
    await expect(setCover(stranger, other.org.id, id, jpeg())).rejects.toMatchObject({ status: 404 });
    await setCover(host, orgId, id, jpeg());
    await expect(removeCover(stranger, orgId, id)).rejects.toMatchObject({ status: 403 });
    await expect(removeCover(stranger, other.org.id, id)).rejects.toMatchObject({ status: 404 });
    expect(await readCover(guest, id)).not.toBeNull();
  });

  it("refuses what isn't a JPEG, PNG or WebP, or is over 5 MB", async () => {
    const { orgId, id } = await posted();
    await expect(setCover(host, orgId, id, Buffer.from("not an image"))).rejects.toMatchObject({ status: 400 });
    await expect(setCover(host, orgId, id, Buffer.alloc(6 * 1024 * 1024, 0xff))).rejects.toMatchObject({ status: 400 });
  });

  it("a replacement gets a newer version; removing it clears the terms and the bytes", async () => {
    const { orgId, id } = await posted();
    const a = await setCover(host, orgId, id, jpeg());
    const b = await setCover(host, orgId, id, jpeg());
    expect(b.cover).toBeGreaterThan(a.cover);
    await removeCover(host, orgId, id);
    expect((await orgEvents(host, orgId))[0].terms.cover).toBeUndefined();
    expect(await readCover(host, id)).toBeNull();
  });

  it("a draft or closed event's cover is read only by its workspace's members and its attendees", async () => {
    const { orgId, id } = await posted();
    await setCover(host, orgId, id, jpeg());
    await rsvp(guest, { listingId: id, name: "Guest" });
    await setEventStatus(host, orgId, id, "closed");
    expect(await readCover(stranger, id)).toBeNull();
    expect(await readCover(host, id)).not.toBeNull();
    expect(await readCover(guest, id)).not.toBeNull();
  });

  it("editing the event's words keeps its cover; search and My events carry it", async () => {
    const { orgId, id } = await posted();
    const { cover } = await setCover(host, orgId, id, jpeg());
    await saveEvent(host, orgId, { ...E, title: "Sunday board games, new venue", startsAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), capacity: 8 }, id);
    expect((await orgEvents(host, orgId))[0].terms.cover).toBe(cover);
    expect((await searchEvents({ query: "board games", places: [] })).results[0].terms.cover).toBe(cover);
    await rsvp(guest, { listingId: id, name: "Guest" });
    expect((await myRsvps(guest))[0].cover).toBe(cover);
  });
});
