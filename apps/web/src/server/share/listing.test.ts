import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import * as H from "@/server/hiring";
import * as I from "@/server/internships/applications";
import { sharedListing } from "./listing";

const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test", name: "Olive Owner" };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const POSTING = { title: "Marketing Intern", description: "Help run our campus campaigns, write posts and learn analytics with a mentor.", location: "Pune", workMode: "hybrid", skills: ["Content", "Canva"], stipendMin: 15000, currency: "INR", durationMonths: 3, startsOn: inDays(40), applyBy: inDays(20), schedule: "full_time" };

beforeEach(() => resetTablesForTests());

describe("a listing's public page reads the public record, and only that", () => {
  it("shows an open WonderWorks listing with every detail its card and page show, as it reads now", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const p = await I.saveInternship(owner, org.id, POSTING as never);
    await I.setInternshipStatus(owner, org.id, p.id, "open");
    const l = await sharedListing("internships", `ws_${p.id}`);
    expect(l).toMatchObject({ module: "internships", noun: "internship", title: "Marketing Intern", url: `/s/internships/ws_${p.id}` });
    const text = [...(l!.facts ?? []), ...(l!.lines ?? []), l!.details].join("\n");
    for (const x of ["Acme", "Duration: 3 months", "Apply by:", "Schedule: Full time", "Skills: Content, Canva", "campus campaigns"]) expect(text).toContain(x);
  });

  it("is gone once the listing closes", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const p = await I.saveInternship(owner, org.id, POSTING as never);
    await I.setInternshipStatus(owner, org.id, p.id, "open");
    expect(await sharedListing("internships", `ws_${p.id}`)).not.toBeNull();
    await I.setInternshipStatus(owner, org.id, p.id, "closed");
    expect(await sharedListing("internships", `ws_${p.id}`)).toBeNull();
  });

  it("a draft, an unknown id, a bad id and another module's id show nothing", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const p = await I.saveInternship(owner, org.id, POSTING as never);
    expect(await sharedListing("internships", `ws_${p.id}`)).toBeNull(); // still a draft
    await I.setInternshipStatus(owner, org.id, p.id, "open");
    expect(await sharedListing("teaching", `ws_${p.id}`)).toBeNull(); // another module's dataset
    expect(await sharedListing("internships", "ws_nope")).toBeNull();
    expect(await sharedListing("internships", "../../etc/passwd")).toBeNull();
    expect(await sharedListing("internships", encodeURIComponent("a b"))).toBeNull();
  });

  it("people's profiles and unknown modules have no public page", async () => {
    expect(await sharedListing("cofounders", "cfp_1")).toBeNull();
    expect(await sharedListing("jobs", "x")).toBeNull();
    expect(await sharedListing("nonsense", "x")).toBeNull();
  });
});
