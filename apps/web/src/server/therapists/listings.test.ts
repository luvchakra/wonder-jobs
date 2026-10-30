import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import * as H from "@/server/hiring";
import * as S from "@/server/services/listings";
import { openTherapistPosts, orgTherapists, saveTherapist, setTherapistStatus } from "./listings";
import { runTherapistsSource, THERAPISTS_SOURCES, WONDERWORKS_THERAPISTS } from "./sources";
import { openServicePosts } from "@/server/services/listings";

const owner: Session = { userId: "u-p", tenantId: "u-p", email: "asha@calm.test", name: "Asha" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@calm.test" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "someone@example.com" };
const L = { title: "Counselling for work stress", description: "I work with adults on stress, relationships and career change, in short sessions.", modes: ["online", "in_person"], city: "Pune", languages: ["English", "Hindi"], focus: ["Stress & anxiety"], feeMin: 1500 };

beforeEach(() => resetTablesForTests());
const workspace = async () => (await H.createWorkspace(owner, { name: "Calm Pune" })).org.id;

describe("practitioner listings", () => {
  it("are module-keyed rows, a draft until opened, then the WonderWorks practitioners source answers with them", async () => {
    const orgId = await workspace();
    const p = await saveTherapist(owner, orgId, L);
    expect(p).toMatchObject({ status: "draft", location: "Pune", workMode: "hybrid", terms: { languages: ["English", "Hindi"], feeMin: 1500 } });
    expect(await table<{ id: string; module: string; org_id: string }>("listings").find({ org_id: orgId })).toEqual([expect.objectContaining({ id: p.id, module: "therapists" })]);
    expect(await openTherapistPosts()).toEqual([]);
    await setTherapistStatus(owner, orgId, p.id, "open");
    const src = THERAPISTS_SOURCES.find((s) => s.id === WONDERWORKS_THERAPISTS)!;
    expect(src.module).toBe("therapists");
    const found = await runTherapistsSource(src, { query: "Hindi", locations: [] });
    expect(found.jobs.map((j) => j.externalId)).toEqual([p.id]);
    await setTherapistStatus(owner, orgId, p.id, "closed");
    expect(await openTherapistPosts()).toEqual([]);
  });

  it("never mixes with another module's listings, in the workspace or in the open feed", async () => {
    const orgId = await workspace();
    const mine = await saveTherapist(owner, orgId, L);
    const svc = await S.saveService(owner, orgId, { title: "Split AC service", description: "Wet service of units, gas check and a test run for your split AC.", lane: "local", category: "AC service & repair", location: "Pune", areas: ["Kothrud"], priceKind: "visit", priceMin: 599 });
    await setTherapistStatus(owner, orgId, mine.id, "open");
    await S.setServiceStatus(owner, orgId, svc.id, "open");
    expect((await orgTherapists(owner, orgId)).map((p) => p.id)).toEqual([mine.id]);
    expect((await openTherapistPosts()).map((p) => p.posting.id)).toEqual([mine.id]);
    expect((await openServicePosts()).map((p) => p.posting.id)).toEqual([svc.id]);
    // A Therapists call can't open or edit a Talent & Services listing by id.
    await expect(setTherapistStatus(owner, orgId, svc.id, "closed")).rejects.toMatchObject({ status: 404 });
    await expect(saveTherapist(owner, orgId, L, svc.id)).rejects.toMatchObject({ status: 404 });
  });

  it("another workspace's listing can't be read or changed; roles decide who edits", async () => {
    const orgId = await workspace();
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() } as never);
    const p = await saveTherapist(owner, orgId, L);
    const { org: theirs } = await H.createWorkspace(other, { name: "Other Practice" });
    await expect(setTherapistStatus(other, theirs.id, p.id, "open")).rejects.toMatchObject({ status: 404 });
    await expect(orgTherapists(other, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(saveTherapist(recruiter, orgId, L)).rejects.toMatchObject({ status: 403 });
    expect(await orgTherapists(recruiter, orgId)).toHaveLength(1);
  });

  it("refuses a listing missing what clients compare, and says what", async () => {
    const orgId = await workspace();
    await expect(saveTherapist(owner, orgId, { ...L, languages: [] })).rejects.toMatchObject({ status: 400 });
  });
});
