import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let admin: string | null = "admin@wonderapps.biz";
vi.mock("@/server/jobslake/access", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/access")>();
  return { ...real, requireAdmin: async () => (admin ? { actor: admin, session: {} } : NextResponse.json({ error: { code: "FORBIDDEN", message: "Admins only" } }, { status: 403 })) };
});

import { GET, PUT } from "./route";
import { GET as publicGET } from "../../../menus/route";
import { defaultMenu } from "@/domain/navigation/menus";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { jobsLakeStore } from "@/server/jobslake/store";

const put = (body: unknown) => PUT(new Request("http://localhost/api/jobs-lake/admin/menus", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(async () => {
  admin = "admin@wonderapps.biz";
  await stateStore.remove(PLATFORM_TENANT, "wj.accountmenu");
  await stateStore.remove(PLATFORM_TENANT, "wj.youmenu");
  await stateStore.remove(PLATFORM_TENANT, "wj.findkindsmenu");
});

describe("menus in WonderStar Admin", () => {
  it("are for admins only to read and change", async () => {
    admin = null;
    expect((await GET()).status).toBe(403);
    expect((await put({ menu: "you", hidden: ["recruiters"] })).status).toBe(403);
    expect((await (await publicGET()).json()).you.hidden).toEqual([]);
  });

  it("save one menu's order and hidden items for everyone, cleaned, and audit who did it", async () => {
    const order = ["search_history", ...defaultMenu("you").order.filter((i) => i !== "search_history")];
    expect((await put({ menu: "you", order: [...order, "made_up"], hidden: ["recruiters", "account"] })).status).toBe(200);
    expect((await put({ menu: "account", hidden: ["account", "analytics"] })).status).toBe(200);
    // Every user's menus read the same, briefly cached; Account can't be hidden.
    const pub = await publicGET();
    expect(pub.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await pub.json()).toEqual({ account: { order: defaultMenu("account").order, hidden: ["analytics"] }, you: { order, hidden: ["recruiters"] }, find_kinds: { order: defaultMenu("find_kinds").order, hidden: [] } });
    const menus = (await (await GET()).json()).menus as { id: string; config: { updatedBy?: string } }[];
    expect(menus.map((m) => m.id)).toEqual(["account", "you", "find_kinds"]);
    expect(menus[1].config.updatedBy).toBe("admin@wonderapps.biz");
    const audit = (await jobsLakeStore().listAudit(5)).filter((e) => e.action === "menu.update");
    expect(audit[0]).toMatchObject({ actor: "admin@wonderapps.biz" });
  });

  it("refuse an unknown menu, and show everyone today's menus while nothing is saved", async () => {
    expect((await put({ menu: "constructor", hidden: [] })).status).toBe(400);
    expect(await (await publicGET()).json()).toEqual({ account: { order: defaultMenu("account").order, hidden: [] }, you: { order: defaultMenu("you").order, hidden: [] }, find_kinds: { order: defaultMenu("find_kinds").order, hidden: [] } });
  });
});
