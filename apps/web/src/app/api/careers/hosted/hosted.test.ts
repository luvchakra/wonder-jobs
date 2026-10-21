import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import * as H from "@/server/hiring";
import * as C from "@/server/careers";
import { POST as apply } from "./[slug]/jobs/[id]/applications/route";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test" };
const form = { name: "Asha Rao", email: "asha@example.com", resumeUrl: "https://drive.example.com/cv", consent: true };

async function hostedJob() {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  const job = await H.saveJob(owner, org.id, { title: "Engineer", location: "Remote", workMode: "remote", description: "Build things with a small team, in TypeScript, for real customers.", applyUrl: "https://acme.test/jobs" });
  await H.setJobStatus(owner, org.id, job.id, "open");
  const { site } = await C.createSite(owner, org.id, { name: "Acme careers", slug: "acme", publicUrl: "", notifyEmails: "jobs@acme.test", retentionMonths: 12 });
  await C.linkJob(owner, org.id, site.id, job.id, true);
  return { orgId: org.id, jobId: job.id };
}

const post = (slug: string, id: string, body: unknown, ip = "203.0.113.7") =>
  apply(new Request(`http://localhost/api/careers/hosted/${slug}/jobs/${id}/applications`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug, id }) });

beforeEach(() => resetTablesForTests());

describe("applying on a hosted careers page", () => {
  it("takes an application without a key, only through a hosted page", async () => {
    const { orgId, jobId } = await hostedJob();
    expect((await post("acme", jobId, form)).status).toBe(200);
    expect((await C.listApplications(owner, orgId)).map((a) => a.email)).toEqual(["asha@example.com"]);
    expect((await post("nobody", jobId, form)).status).toBe(404);
  });

  it("refuses the hidden bot field and an invalid form", async () => {
    const { jobId } = await hostedJob();
    expect((await post("acme", jobId, { ...form, website: "spam.example" }, "198.51.100.1")).status).toBe(400);
    expect((await post("acme", jobId, { ...form, consent: false }, "198.51.100.2")).status).toBe(400);
  });

  it("limits how many applications one address can send", async () => {
    const { jobId } = await hostedJob();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post("acme", jobId, { ...form, email: `a${i}@example.com` }, "192.0.2.9")).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(10);
    expect(codes.at(-1)).toBe(429);
  });
});
