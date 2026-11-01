import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
const worksLake = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/server/jobslake/core", async (orig) => ({ ...(await orig<typeof import("@/server/jobslake/core")>()), search: (...a: unknown[]) => worksLake.run(...a) }));

import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import * as H from "@/server/hiring";
import { applyToScholarship, decideScholarship, myScholarshipApplication, myScholarshipApplications, orgScholarshipApplications, saveScholarship, setScholarshipStatus, withdrawScholarship } from "./applications";
import { outside, searchScholarships, termsFromAttributes } from "./search";
import { rawFromDevfolio, providerFromTitle, rawFromFeedItem, statedDeadline, devpostEnd, GRANTS_GOV_NOTICE, rawFromDevpost, rawFromGrants, rawFromKaggle, rawFromSedia, rawFromUnstop, SCHOLARSHIP_SOURCES, scholarshipSourceAvailable, unstopLevels, usDate, WONDERSTAR_SCHOLARSHIPS } from "./sources";

const owner: Session = { userId: "u-org", tenantId: "u-org", email: "team@foundation.test" };
const student: Session = { userId: "u-stu", tenantId: "u-stu", email: "asha@student.test" };
const other: Session = { userId: "u-oth", tenantId: "u-oth", email: "ravi@student.test" };
const GATEWAY = "works_gateway_scholarships";
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const posting = {
  kind: "scholarship",
  title: "Merit scholarship for engineering students",
  description: "A yearly award for first-year engineering students from families with modest incomes.",
  levels: ["ug"],
  deadline: future(30),
  officialUrl: "https://foundation.example.org/merit",
  currency: "INR",
  providerType: "foundation",
  awardAmount: 50000,
  awardPeriod: "per_year",
  questions: [{ id: "why", text: "Why do you need this scholarship?", required: true }],
  noFee: true,
};
const profile = { level: "ug", field: "Mechanical engineering", institution: "COEP", region: "Maharashtra, India", sensitiveConsent: true, incomeBand: 300000, gender: "female", category: "OBC" };

const opp = (over: Partial<CanonicalOpportunity> = {}): CanonicalOpportunity =>
  ({
    id: "opp_1", title: "STEM scholarship for undergraduate women", description: "Open to undergraduate students in engineering.", employer: { name: "Example Trust", domain: "trust.example.org" }, locations: ["India"], workplaceType: "onsite", skills: [],
    canonicalApplyUrl: "https://trust.example.org/apply", postedAt: "2026-10-30T00:00:00Z", sourceRecords: [{ sourceId: GATEWAY, sourceName: "Partner: Example Trust", sourceJobId: "t1", canonical: true }],
    attributes: { deadline: future(10), award: 25000, currency: "INR", levels: "ug", documents: "Marksheet; Income certificate" },
    ...over,
  }) as unknown as CanonicalOpportunity;

beforeEach(() => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
  worksLake.run.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("its own WorksLake dataset", () => {
  it("every built-in source is the Scholarships module's, never Jobs'", () => {
    expect(new Set(SCHOLARSHIP_SOURCES.map((s) => s.module))).toEqual(new Set(["scholarships"]));
    expect(SCHOLARSHIP_SOURCES.map((s) => s.id)).toEqual([WONDERSTAR_SCHOLARSHIPS, "schol_grants_gov", "schol_devpost", "schol_unstop", "schol_eu_msca", "schol_opportunity_desk", "schol_scholars4dev", "schol_devfolio", "schol_kaggle"]);
  });

  it("sources whose terms aren't confirmed say what's pending; Kaggle needs its key", () => {
    for (const id of ["schol_devpost", "schol_unstop", "schol_eu_msca", "schol_opportunity_desk", "schol_scholars4dev", "schol_devfolio"]) expect(SCHOLARSHIP_SOURCES.find((s) => s.id === id)?.statusReason).toMatch(/^terms pending: /);
    expect(scholarshipSourceAvailable(SCHOLARSHIP_SOURCES.find((s) => s.id === "schol_kaggle")!)).toBe(false);
  });

  it("searches with module 'scholarships', and an empty query is allowed", async () => {
    worksLake.run.mockResolvedValue({ response: { results: [], sources: [] }, plan: { skipped: [] } });
    await searchScholarships({ query: "", places: [] });
    expect(worksLake.run.mock.calls[0][0]).toMatchObject({ module: "scholarships", query: { text: "" } });
  });

  it("is worldwide: a place is never applied (owner, 2026-11-01)", async () => {
    worksLake.run.mockResolvedValue({ response: { results: [], sources: [] }, plan: { skipped: [] } });
    const r = await searchScholarships({ query: "engineering", places: ["Pune"] });
    expect(worksLake.run.mock.calls[0][0].query.locations).toEqual([]);
    expect(r.searched.places).toEqual([]);
  });
});

describe("outside listings", () => {
  it("carry only what their source states", () => {
    expect(outside(opp())).toMatchObject({ origin: "outside", company: "Example Trust", companyDomain: "trust.example.org", applyUrl: "https://trust.example.org/apply", terms: { kind: "scholarship", awardAmount: 25000, levels: ["ug"], documents: ["Marksheet", "Income certificate"], officialUrl: "https://trust.example.org/apply" } });
    expect(termsFromAttributes(opp({ title: "Live data project", description: "Six-week project with a mentor.", attributes: { kind: "project", stipend: "5,000" } } as never))).toMatchObject({ kind: "project", stipend: 5000 });
  });

  it("drop one past its deadline, one that mentions a fee to apply, and one without an official https link", () => {
    expect(outside(opp({ attributes: { deadline: "2020-01-01" } } as never))).toBeNull();
    expect(outside(opp({ description: "Registration fee of ₹500 applies." }))).toBeNull();
    expect(outside(opp({ canonicalApplyUrl: "http://trust.example.org/apply", attributes: {} } as never))).toBeNull();
    expect(outside(opp({ description: "There is no application fee." }))).not.toBeNull();
  });

  it("Grants.gov: only ones for students, with its notice and official page", () => {
    expect(usDate("05/01/2028")).toBe("2028-05-01");
    const hit = { id: "362034", number: "NOAA-1", title: "Marine Education and Training Mini-Grant Program", agency: "NOAA", openDate: "10/01/2026", closeDate: "05/01/2028", oppStatus: "posted" };
    expect(rawFromGrants(hit)).toMatchObject({ applyUrl: "https://www.grants.gov/search-results-detail/362034", attributes: { deadline: "2028-05-01", notice: GRANTS_GOV_NOTICE, currency: "USD" } });
    expect(rawFromGrants({ ...hit, title: "Annual Program Statement for Fiscal Year 2025" })).toBeNull();
  });
});

describe("Devpost, Unstop, EU fellowships and Kaggle map only what they state", () => {
  it("Devpost: an open hackathon is a project, ending on its submission deadline", () => {
    expect(devpostEnd("Oct 01 - Nov 12, 2026")).toBe("2026-11-12");
    expect(devpostEnd("Dec 15, 2026 - Jan 10, 2027")).toBe("2027-01-10");
    expect(devpostEnd("Ongoing")).toBeUndefined();
    const raw = rawFromDevpost({ id: 1, title: "AI Hackathon", url: "https://ai.devpost.com/", organization_name: "PayPal", submission_period_dates: "Oct 01 - Nov 12, 2026", prize_amount: "$<span>67,500</span>", themes: [{ name: "Web" }], displayed_location: { location: "Online" }, open_state: "open" });
    expect(raw).toMatchObject({ company: "PayPal", remote: true, applyUrl: "https://ai.devpost.com/", attributes: { kind: "project", deadline: "2026-11-12", officialUrl: "https://ai.devpost.com/" } });
    expect(raw!.description).toContain("Prizes: $67,500.");
    expect(rawFromDevpost({ id: 2, title: "Old", url: "https://x.devpost.com/", open_state: "ended" })).toBeNull();
  });

  it("Unstop: paid or closed listings are left out; its eligibility filters give the levels", () => {
    const o = { id: 9, title: "Merit scholarship", type: "scholarships", seo_url: "https://unstop.com/scholarships/merit-9", isPaid: false, status: "LIVE", regn_open: 1, region: "online", organisation: { name: "Trust" }, filters: [{ name: "College Students", type: "eligible" }, { name: "School Students", type: "eligible" }], regnRequirements: { end_regn_dt: "2026-11-13T18:00:00+05:30" } };
    expect(rawFromUnstop(o)).toMatchObject({ company: "Trust", attributes: { kind: "scholarship", deadline: "2026-11-13", levels: "school;ug", region: "India" } });
    expect(rawFromUnstop({ ...o, isPaid: true })).toBeNull();
    expect(rawFromUnstop({ ...o, regn_open: 0 })).toBeNull();
    expect(rawFromUnstop({ ...o, type: "hackathons" })!.attributes).toMatchObject({ kind: "project" });
    expect(unstopLevels([{ name: "Postgraduate", type: "eligible" }, { name: "PhD Scholars", type: "eligible" }])).toBe("pg;phd");
  });

  it("EU: only fellowship calls, linked to the call's official page", () => {
    expect(rawFromSedia({ url: "x", metadata: { title: ["MSCA Postdoctoral Fellowships 2027"], identifier: ["HORIZON-MSCA-2027-PF-01-01"], deadlineDate: ["2027-09-08T00:00:00.000+0000"] } })).toMatchObject({ applyUrl: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-MSCA-2027-PF-01-01", attributes: { deadline: "2027-09-08", levels: "phd" } });
    expect(rawFromSedia({ url: "x", metadata: { title: ["Doctoral Networks 2027"], identifier: ["HORIZON-MSCA-2027-DN-01-01"] } })).toBeNull();
  });

  it("scholarship blogs' RSS: one post, one opportunity, its stated deadline; round-ups are left out", () => {
    expect(statedDeadline("Deadline: December 14, 2026 Applications are open")).toBe("2026-12-14");
    expect(statedDeadline("Deadline:  15 Jan 2027 (annual)")).toBe("2027-01-15");
    expect(statedDeadline("Deadline: Unspecified")).toBeUndefined();
    expect(providerFromTitle("Mastercard Foundation Scholars Program at American University of Cairo (AUC) Spring 2027", "Feed")).toBe("American University of Cairo (AUC)");
    expect(providerFromTitle("SMART Scholarship-for-Service Program 2027", "Feed")).toBe("Feed");
    const item = (title: string) => `<item><title>${title}</title><link>https://opportunitydesk.org/2026/10/30/x/</link><pubDate>Thu, 30 Oct 2026 10:00:00 +0000</pubDate><description><![CDATA[Deadline: December 14, 2026 Applications are open.]]></description></item>`;
    expect(rawFromFeedItem(item("Mastercard Foundation Scholars Program at Sciences Po 2027 (Fully-funded)"), { name: "Opportunity Desk" })).toMatchObject({ company: "Sciences Po", applyUrl: "https://opportunitydesk.org/2026/10/30/x/", attributes: { kind: "scholarship", deadline: "2026-12-14" } });
    for (const t of ["10+ Scholarships in Canada for International Students", "Top 20 Excellence Scholarships", "Fully Funded Scholarships for International Students"]) expect(rawFromFeedItem(item(t), { name: "Feed" }), t).toBeNull();
  });

  it("Devfolio: an open Indian hackathon is a project, closing when registration ends; a private one is left out", () => {
    const h = { name: "DevNexus 2.0", slug: "devnexus2", city: "Kolkata", country: "India", is_online: false, starts_at: "2026-11-27T18:30:00+00:00", ends_at: "2026-11-28T18:30:00+00:00", themes: [{ name: "Web3" }], hackathon_setting: { reg_ends_at: "2026-11-20T18:30:00+00:00", subdomain: "devnexus2" } };
    expect(rawFromDevfolio(h)).toMatchObject({ location: "Kolkata, India", applyUrl: "https://devnexus2.devfolio.co/", attributes: { kind: "project", deadline: "2026-11-20", region: "India" } });
    expect(rawFromDevfolio({ ...h, private: true })).toBeNull();
  });

  it("Kaggle: a competition is an online project with its deadline", () => {
    expect(rawFromKaggle({ id: 3, ref: "titanic", title: "Titanic", deadline: "2030-01-07T23:59:00Z", reward: "Knowledge" })).toMatchObject({ applyUrl: "https://www.kaggle.com/competitions/titanic", remote: true, attributes: { kind: "project", deadline: "2030-01-07" } });
  });
});

describe("posted on WonderWorks, applied to on the student's own press", () => {
  async function openOne() {
    const { org } = await H.createWorkspace(owner, { name: "Example Foundation" });
    await expect(saveScholarship(owner, org.id, { ...posting, description: `${posting.description} Application fee: ₹200.` })).rejects.toThrow(/fee/);
    const p = await saveScholarship(owner, org.id, posting);
    await setScholarshipStatus(owner, org.id, p.id, "open");
    return { org, p };
  }

  it("lists an open one in Find with its own terms and questions", async () => {
    const { p } = await openOne();
    const own = opp({ id: "opp_own", sourceRecords: [{ sourceId: WONDERSTAR_SCHOLARSHIPS, sourceName: "WonderWorks organisations", sourceJobId: p.id }] as never });
    worksLake.run.mockResolvedValue({ response: { results: [own, opp()], sources: [{ sourceId: WONDERSTAR_SCHOLARSHIPS, sourceName: "WonderWorks organisations", outcome: "ok" }, { sourceId: GATEWAY, sourceName: "Partner: Example Trust", outcome: "ok" }] }, plan: { skipped: [] } });
    const r = await searchScholarships({ query: "engineering", places: [] });
    expect(r.results.map((x) => x.id)).toEqual([`ws_${p.id}`, "opp_1"]);
    expect(r.results[0]).toMatchObject({ origin: "wonderstar", company: "Example Foundation", terms: { awardAmount: 50000 }, questions: [{ id: "why", required: true }] });
    expect(r.sources.map((s) => [s.id, s.count])).toEqual([[WONDERSTAR_SCHOLARSHIPS, 1], [GATEWAY, 1]]);
  });

  it("asks first without a saved policy (fails closed), needs required answers, and sends sensitive fields only when shared", async () => {
    const { org, p } = await openOne();
    const base = { postingId: p.id, name: "Asha", profile, consent: true as const };
    await expect(applyToScholarship(student, base)).rejects.toThrow(/press Send/);
    await expect(applyToScholarship(student, { ...base, confirmed: true })).rejects.toThrow(/Answer: Why/);
    await expect(applyToScholarship(student, { ...base, confirmed: true, answers: { why: "To pay fees" }, profile: { ...profile, level: "pg" } })).rejects.toThrow(/Undergraduate/);
    const out = await applyToScholarship(student, { ...base, confirmed: true, answers: { why: "To pay my college fees." } });
    await expect(applyToScholarship(student, { ...base, confirmed: true, answers: { why: "again" } })).rejects.toThrow(/already applied/);
    const [seen] = await orgScholarshipApplications(owner, org.id);
    expect(seen).toMatchObject({ name: "Asha", answers: [{ question: "Why do you need this scholarship?", answer: "To pay my college fees." }] });
    expect(seen.profile).not.toHaveProperty("incomeBand");
    expect(seen.profile).not.toHaveProperty("gender");

    await applyToScholarship(other, { ...base, confirmed: true, shareSensitive: true, answers: { why: "Need" }, profile: { ...profile, field: "Civil engineering" } });
    const shared = (await orgScholarshipApplications(owner, org.id)).find((a) => a.email === "ravi@student.test")!;
    expect(shared.profile).toMatchObject({ incomeBand: 300000, gender: "female", category: "OBC" });

    // Each student sees only their own.
    expect((await myScholarshipApplications(student)).map((a) => a.id)).toEqual([out.id]);
    await expect(myScholarshipApplication(other, out.id)).rejects.toThrow(/isn't yours/);
  });

  it("moves through Shortlisted → Awarded / Selected → Completed; withdraw only while open", async () => {
    const { org, p } = await openOne();
    const a = await applyToScholarship(student, { postingId: p.id, name: "Asha", profile, consent: true, confirmed: true, answers: { why: "Need" } });
    await expect(decideScholarship(owner, org.id, a.id, "done")).rejects.toThrow(/can't move/);
    await decideScholarship(owner, org.id, a.id, "shortlisted");
    await decideScholarship(owner, org.id, a.id, "accepted");
    await expect(withdrawScholarship(student, a.id)).rejects.toThrow(/awarded/i);
    await decideScholarship(owner, org.id, a.id, "done");
    const mine = await myScholarshipApplication(student, a.id);
    expect(mine.status).toBe("done");
    expect(mine.events.map((e) => e.status)).toEqual(["applied", "shortlisted", "accepted", "done"]);
    await expect(decideScholarship(other, org.id, a.id, "declined")).rejects.toThrow();
  });
});
