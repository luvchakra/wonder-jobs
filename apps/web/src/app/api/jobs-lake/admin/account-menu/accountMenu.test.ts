import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let admin: string | null = "admin@wonderapps.biz";
vi.mock("@/server/jobslake/access", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/access")>();
  return { ...real, requireAdmin: async () => (admin ? { actor: admin, session: {} } : NextResponse.json({ error: { code: "FORBIDDEN", message: "Admins only" } }, { status: 403 })) };
});

import { GET, PUT } from "./route";
import { GET as publicGET } from "../../../account-menu/route";
import { DEFAULT_ACCOUNT_MENU } from "@/domain/navigation/accountMenu";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { jobsLakeStore } from "@/server/jobslake/store";

const put = (body: unknown) => PUT(new Request("http://localhost/api/jobs-lake/admin/account-menu", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(async () => {
  admin = "admin@wonderapps.biz";
  await stateStore.remove(PLATFORM_TENANT, "wj.accountmenu");
});

describe("the account menu in WonderJobs Admin", () => {
  it("is for admins only to read and change", async () => {
    admin = null;
    expect((await GET()).status).toBe(403);
    expect((await put({ order: ["help"], hidden: ["hiring"] })).status).toBe(403);
    expect((await (await publicGET()).json()).hidden).toEqual([]);
  });

  it("saves the order and hidden items for everyone, cleaned, and audits who did it", async () => {
    const order = ["help", "hiring", ...DEFAULT_ACCOUNT_MENU.order.filter((i) => i !== "help" && i !== "hiring")];
    const res = await put({ order: [...order, "made_up"], hidden: ["analytics", "account"] });
    expect(res.status).toBe(200);
    // Every user's menu reads the same, briefly cached; Account can't be hidden.
    const pub = await publicGET();
    expect(pub.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await pub.json()).toEqual({ order, hidden: ["analytics"] });
    expect((await (await GET()).json()).menu).toMatchObject({ order, hidden: ["analytics"], updatedBy: "admin@wonderapps.biz" });
    const audit = (await jobsLakeStore().listAudit(5)).find((e) => e.action === "account_menu.update");
    expect(audit).toMatchObject({ actor: "admin@wonderapps.biz" });
  });

  it("shows everyone today's menu while nothing is saved", async () => {
    expect(await (await publicGET()).json()).toEqual({ order: DEFAULT_ACCOUNT_MENU.order, hidden: [] });
  });
});
