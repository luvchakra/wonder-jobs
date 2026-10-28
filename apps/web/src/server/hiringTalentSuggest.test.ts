import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import * as H from "@/server/hiring";
import { suggestTalent } from "@/domain/org/talent";

const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test", name: "Olive Owner" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "other@beta.test", name: "Oscar Other" };
const seeker = (n: string): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` });
const DESC = "Design payments flows with engineering and product, end to end, for real customers.";
const base = { title: "Product Designer", location: "Bengaluru", workMode: "hybrid" as const, currency: "INR", description: DESC, skills: ["Figma", "Prototyping"], applyUrl: "https://acme.test/jobs" };

beforeEach(() => resetTablesForTests());

describe("talent suggested for a job", () => {
  const profile = { headline: "Designer", seniority: "junior", yearsExperience: 1, workModes: ["hybrid"], summary: "" };
  it("ranks opted-in people by the job's skills, in its city unless it's remote", () => {
    const people = [
      { tenantId: "a", displayName: "A", skills: ["Figma"], locations: ["Bengaluru"], updatedAt: "2026-10-01", ...profile },
      { tenantId: "b", displayName: "B", skills: ["figma", "Prototyping"], locations: ["Bengaluru, India"], updatedAt: "2026-09-01", ...profile },
      { tenantId: "c", displayName: "C", skills: ["Figma", "Prototyping"], locations: ["Pune"], updatedAt: "2026-10-02", ...profile },
      { tenantId: "d", displayName: "D", skills: ["Go"], locations: ["Bengaluru"], updatedAt: "2026-10-03", ...profile },
    ];
    expect(suggestTalent(people, { skills: ["Figma", "Prototyping"], location: "Bengaluru", workMode: "hybrid" }).map((m) => [m.profile.tenantId, m.score])).toEqual([["b", 2], ["a", 1]]);
    expect(suggestTalent(people, { skills: ["Figma", "Prototyping"], location: "Bengaluru", workMode: "remote" }).map((m) => m.profile.tenantId)).toEqual(["c", "b", "a"]);
    expect(suggestTalent(people, { skills: [], location: "Bengaluru", workMode: "remote" })).toEqual([]);
  });

  it("only for the caller's own workspace's job, and only people open to recruiters", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const { org: theirs } = await H.createWorkspace(other, { name: "Beta" });
    const job = await H.saveJob(owner, org.id, { ...base, jobType: "full_time" });
    const theirJob = await H.saveJob(other, theirs.id, { ...base, jobType: "full_time" });
    await H.saveMyTalentProfile(seeker("riya"), { displayName: "Riya S.", headline: "Designer", seniority: "junior", yearsExperience: 1, skills: ["Figma"], locations: ["Bengaluru"], workModes: ["hybrid"], summary: "" });
    expect((await H.suggestTalentForJob(owner, org.id, job.id)).map((m) => m.profile.displayName)).toEqual(["Riya S."]);
    // Another company's job, even by id, is refused; so is another company's workspace.
    await expect(H.suggestTalentForJob(owner, org.id, theirJob.id)).rejects.toThrow(/isn't in this workspace/);
    await expect(H.suggestTalentForJob(owner, theirs.id, theirJob.id)).rejects.toThrow();
    await H.removeMyTalentProfile(seeker("riya"));
    expect(await H.suggestTalentForJob(owner, org.id, job.id)).toEqual([]);
  });
});
