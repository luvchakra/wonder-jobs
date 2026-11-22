import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/*
 * The warning before Delete account (WJ-838) through its real route: it answers only a signed-in caller, with that
 * caller's own numbers, never another person's; and the deletion itself still needs the typed phrase.
 */
type Actor = { userId: string; tenantId: string; email: string; name: string };
let current: Actor | null = null;
vi.mock("@/server/auth", () => ({
  requireSession: async () => current ?? NextResponse.json({ error: "Sign in required" }, { status: 401 }),
}));
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests, table } from "@/server/db/table";
import { GET, POST } from "./route";

const asha: Actor = { userId: "u-asha", tenantId: "u-asha", email: "asha@example.com", name: "Asha" };
const ravi: Actor = { userId: "u-ravi", tenantId: "u-ravi", email: "ravi@example.com", name: "Ravi" };
const post = (body: unknown) => POST(new Request("http://localhost/api/privacy/erase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(async () => {
  resetTablesForTests();
  current = null;
  // Asha applied to two companies and sent one internship request; Ravi applied to one company.
  await table("job_applications").insert({ id: "a1", org_id: "o1", job_id: "j1", applicant_tenant: asha.tenantId, status: "new", created_at: "2026-11-01" });
  await table("job_applications").insert({ id: "a2", org_id: "o2", job_id: "j2", applicant_tenant: asha.tenantId, status: "new", created_at: "2026-11-02" });
  await table("responses").insert({ id: "r1", module: "internships", listing_id: "l1", org_id: "o3", responder_tenant: asha.tenantId, status: "applied", created_at: "2026-11-03" });
  await table("job_applications").insert({ id: "a3", org_id: "o1", job_id: "j1", applicant_tenant: ravi.tenantId, status: "new", created_at: "2026-11-04" });
});

describe("GET /api/privacy/erase: the warning's numbers", () => {
  it("refuses a caller who isn't signed in", async () => {
    expect((await GET()).status).toBe(401);
  });

  it("gives each person their own numbers only, uncached", async () => {
    current = asha;
    const mine = await GET();
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toBe("no-store");
    expect((await mine.json()).preview).toMatchObject({ applications: 2, companies: 2, requests: { internships: 1 }, bookings: 0 });
    current = ravi;
    const his = (await (await GET()).json()).preview;
    expect(his).toMatchObject({ applications: 1, companies: 1, requests: {}, bookings: 0 });
    expect(JSON.stringify(his)).not.toContain(asha.tenantId);
  });
});

describe("POST /api/privacy/erase: the deletion itself", () => {
  it("refuses a caller who isn't signed in, and anything but the typed phrase, leaving what they sent in place", async () => {
    expect((await post({ confirm: "DELETE MY ACCOUNT" })).status).toBe(401);
    current = asha;
    for (const body of [{}, { confirm: "delete my account" }, { confirm: "DELETE MY ACCOUNT", also: 1 }]) expect((await post(body)).status).toBe(400);
    expect(await table("job_applications").find({ applicant_tenant: asha.tenantId })).toHaveLength(2);
    expect(await table("responses").find({ responder_tenant: asha.tenantId })).toHaveLength(1);
  });
});
