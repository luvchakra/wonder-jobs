import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let admin: string | null = "admin@wonderapps.biz";
vi.mock("@/server/jobslake/access", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/access")>();
  return { ...real, requireAdmin: async () => (admin ? { actor: admin, session: {} } : NextResponse.json({ error: { code: "FORBIDDEN", message: "Admins only" } }, { status: 403 })) };
});

import { GET, PUT } from "./route";
import { GET as publicGET } from "../../../ui/route";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { jobsLakeStore } from "@/server/jobslake/store";

const put = (body: unknown) => PUT(new Request("http://localhost/api/jobs-lake/admin/ui", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(async () => {
  admin = "admin@wonderapps.biz";
  await stateStore.remove(PLATFORM_TENANT, "wj.look");
});

describe("the platform's UI switch", () => {
  it("shows everyone the first UI until an admin switches, and only admins can switch", async () => {
    expect(await (await publicGET()).json()).toEqual({ version: 1 });
    admin = null;
    expect((await GET()).status).toBe(403);
    expect((await put({ version: 2 })).status).toBe(403);
    expect(await (await publicGET()).json()).toEqual({ version: 1 });
  });

  it("switches everyone to the second UI and back, briefly cached, and audits who did it", async () => {
    expect((await put({ version: 2 })).status).toBe(200);
    const pub = await publicGET();
    expect(pub.headers.get("cache-control")).toContain("s-maxage=60");
    // Only the version leaves the server: not who set it.
    expect(await pub.json()).toEqual({ version: 2 });
    expect((await (await GET()).json()).ui).toMatchObject({ version: 2, updatedBy: "admin@wonderapps.biz" });
    expect((await put({ version: 1 })).status).toBe(200);
    expect(await (await publicGET()).json()).toEqual({ version: 1 });
    const audit = (await jobsLakeStore().listAudit(5)).filter((e) => e.action === "ui.update");
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor: "admin@wonderapps.biz" });
  });

  it("refuses anything but 1 or 2, and keeps the look", async () => {
    await put({ version: 2 });
    for (const bad of [{ version: 3 }, { version: "1" }, {}, { version: null }]) expect((await put(bad)).status).toBe(400);
    expect(await (await publicGET()).json()).toEqual({ version: 2 });
  });
});
