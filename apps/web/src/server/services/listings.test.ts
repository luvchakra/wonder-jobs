import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import * as H from "@/server/hiring";
import * as T from "@/server/teaching/applications";
import { openServicePosts, orgServices, saveService, setServiceStatus } from "./listings";
import { runServicesSource, SERVICES_SOURCES, WONDERSTAR_SERVICES } from "./sources";

const owner: Session = { userId: "u-pro", tenantId: "u-pro", email: "ravi@coolfix.test", name: "Ravi" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@coolfix.test" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "someone@example.com" };
const AC = { title: "Split AC service and gas refill", description: "Wet service of indoor and outdoor units, gas pressure check and refill, and a test run.", lane: "local", category: "AC service & repair", location: "Pune", areas: ["Kothrud", "411038"], priceKind: "visit", priceMin: 599, visitCharge: 199, materials: "extra", warrantyDays: 30, gst: true };

beforeEach(() => resetTablesForTests());

async function workspace() {
  const { org } = await H.createWorkspace(owner, { name: "CoolFix Pune" });
  return org.id;
}

describe("a pro's service listings (pro side)", () => {
  it("are module-keyed rows in the workspace, saved as the pro stated them, a draft until opened", async () => {
    const orgId = await workspace();
    const p = await saveService(owner, orgId, AC);
    expect(p).toMatchObject({ status: "draft", location: "Pune", workMode: "onsite", terms: { lane: "local", category: "AC service & repair", priceKind: "visit", priceMin: 599, visitCharge: 199, materials: "extra", warrantyDays: 30, areas: ["Kothrud", "411038"], gst: true, currency: "INR" } });
    expect(await table<{ id: string; module: string; org_id: string }>("listings").find({ org_id: orgId })).toEqual([expect.objectContaining({ id: p.id, module: "services" })]);
    // A draft is not in clients' searches; an open one is; a closed one leaves them.
    expect(await openServicePosts()).toEqual([]);
    await setServiceStatus(owner, orgId, p.id, "open");
    expect((await openServicePosts()).map((x) => x.posting.id)).toEqual([p.id]);
    const found = await runServicesSource(SERVICES_SOURCES.find((s) => s.id === WONDERSTAR_SERVICES)!, { query: "AC service", locations: ["Pune"] });
    expect(found.jobs.map((j) => j.externalId)).toEqual([p.id]);
    await setServiceStatus(owner, orgId, p.id, "closed");
    expect(await openServicePosts()).toEqual([]);
  });

  it("only lists this module's listings for this workspace: not another module's in it, not another workspace's", async () => {
    const orgId = await workspace();
    const mine = await saveService(owner, orgId, AC);
    await T.saveOpening(owner, orgId, { title: "PGT Physics", description: "Teach physics to classes 11 and 12 at our CBSE school, with labs.", location: "Pune", workMode: "onsite", subject: "Physics", grades: ["senior"], hours: "full_time" });
    const { org: theirs } = await H.createWorkspace(other, { name: "Other Pros" });
    await saveService(other, theirs.id, { ...AC, title: "Their AC service" });
    expect((await orgServices(owner, orgId)).map((p) => p.id)).toEqual([mine.id]);
    // Editing or opening another workspace's listing by id finds nothing here.
    const theirsId = (await orgServices(other, theirs.id))[0].id;
    await expect(setServiceStatus(owner, orgId, theirsId, "open")).rejects.toMatchObject({ status: 404 });
    await expect(saveService(owner, orgId, AC, theirsId)).rejects.toMatchObject({ status: 404 });
  });

  it("only a role that may edit posts or opens; someone outside the workspace can't even read it", async () => {
    const orgId = await workspace();
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() } as never);
    const p = await saveService(owner, orgId, AC);
    await expect(saveService(recruiter, orgId, AC)).rejects.toMatchObject({ status: 403 });
    await expect(setServiceStatus(recruiter, orgId, p.id, "open")).rejects.toMatchObject({ status: 403 });
    expect(await orgServices(recruiter, orgId)).toHaveLength(1);
    await expect(orgServices(other, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(saveService(other, orgId, AC)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a listing missing what clients compare, and says what", async () => {
    const orgId = await workspace();
    await expect(saveService(owner, orgId, { ...AC, areas: [] })).rejects.toMatchObject({ status: 400, message: "List the areas or pin codes you serve." });
    await expect(saveService(owner, orgId, { ...AC, category: "Design" })).rejects.toMatchObject({ status: 400 });
  });
});
