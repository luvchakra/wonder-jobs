import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let admin: string | null = "admin@wonderapps.biz";
vi.mock("@/server/jobslake/access", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/access")>();
  return { ...real, requireAdmin: async () => (admin ? { actor: admin, session: {} } : NextResponse.json({ error: { code: "FORBIDDEN", message: "Admins only" } }, { status: 403 })) };
});
const testConnection = vi.fn();
vi.mock("@/server/careerSite/client", () => ({ clearCareersCache: () => undefined, testCareersConnection: () => testConnection() }));

import { DELETE, GET, POST, PUT } from "./route";
import { jobsLakeStore } from "@/server/jobslake/store";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-the-careers-admin-route-0123456789";
const KEY = "wjcs_" + "Q".repeat(30) + "abcd";
const put = (key: string) => PUT(new Request("http://localhost/api/jobs-lake/admin/careers", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }));

beforeEach(async () => {
  admin = "admin@wonderapps.biz";
  await DELETE();
});

describe("the careers key setting in WonderJobs Admin", () => {
  it("is for admins only", async () => {
    admin = null;
    expect((await GET()).status).toBe(403);
    expect((await put(KEY)).status).toBe(403);
    expect((await DELETE()).status).toBe(403);
    expect((await POST()).status).toBe(403);
    expect(await jobsLakeStore().getCredential("careers_site_key")).toBeUndefined();
  });

  it("saves the key encrypted, returns only the mask, and audits it", async () => {
    const res = await put(KEY);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text).key.masked).toBe("wjcs_••••••••abcd");
    const read = await (await GET()).text();
    expect(read).not.toContain(KEY);
    expect((await jobsLakeStore().getCredential("careers_site_key"))?.ciphertext).not.toContain(KEY);
    const audit = (await jobsLakeStore().listAudit(5)).find((e) => e.action === "careers_key_saved");
    expect(audit).toMatchObject({ actor: "admin@wonderapps.biz", detail: { last4: "abcd" } });
  });

  it("refuses something that isn't a career-site key", async () => {
    const res = await put("not-a-key");
    expect(res.status).toBe(400);
  });

  it("reports the connection test as is", async () => {
    testConnection.mockResolvedValue({ state: "connected", jobs: 3, site: "WonderJobs careers" });
    expect((await (await POST()).json()).check).toEqual({ state: "connected", jobs: 3, site: "WonderJobs careers" });
  });
});
