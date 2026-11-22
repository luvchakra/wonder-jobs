import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests, table } from "../db/table";
import { erasePreview } from "./erasePreview";
import { eraseSent } from "../sentAccount";

beforeEach(() => resetTablesForTests());

describe("the warning before deleting an account (owner, 2026-11-22)", () => {
  it("counts what goes and what passes on; deletion then removes what the person sent", async () => {
    const t = "u-asha";
    await table("job_applications").insert({ id: "a1", org_id: "o1", job_id: "j1", applicant_tenant: t, status: "new", created_at: "2026-11-01" });
    await table("job_applications").insert({ id: "a2", org_id: "o2", job_id: "j2", applicant_tenant: t, status: "new", created_at: "2026-11-02" });
    await table("job_application_files").insert({ application_id: "a1", mime: "application/pdf" });
    await table("responses").insert({ id: "r1", module: "internships", listing_id: "l1", org_id: "o3", responder_tenant: t, status: "applied", created_at: "2026-11-03" });
    await table("responses").insert({ id: "r2", module: "teaching", listing_id: "l2", org_id: "o4", responder_tenant: t, status: "requested", created_at: "2026-11-03" });
    await table("bookings").insert({ id: "b1", module: "teaching", response_id: "r2", responder_tenant: t, created_by: "u-school", starts_at: "2026-12-01", status: "confirmed" });
    await table("bookings").insert({ id: "b2", module: "teaching", response_id: "rX", responder_tenant: "u-ravi", created_by: t, starts_at: "2026-12-02", status: "confirmed" });
    await table("hiring_members").insert({ org_id: "w1", tenant_id: t, role: "owner" });
    await table("hiring_members").insert({ org_id: "w1", tenant_id: "u-ravi", role: "recruiter" });
    await table("hiring_members").insert({ org_id: "w2", tenant_id: t, role: "owner" });
    expect(await erasePreview(t)).toMatchObject({ applications: 2, companies: 2, requests: { internships: 1, teaching: 1 }, bookings: 1, workspacesHandedOn: 1, workspacesClosed: 1 });
    await eraseSent(t);
    for (const [name, where] of [["job_applications", { applicant_tenant: t }], ["responses", { responder_tenant: t }], ["bookings", { responder_tenant: t }], ["job_application_files", { application_id: "a1" }]] as const) expect(await table(name).find(where), name).toEqual([]);
    // A booking the person offered as a school member stays the other person's, without their id.
    expect((await table<{ created_by: string }>("bookings").find({ id: "b2" }))[0].created_by).toBe("former-member");
  });
});
