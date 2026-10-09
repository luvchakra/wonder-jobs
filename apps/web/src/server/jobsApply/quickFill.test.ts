import { describe, expect, it, vi } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { defaultPolicy } from "@/domain/automation/policy";
import type { ApplicationField } from "@/domain/jobs-apply/types";
import { writeClientState } from "@/server/clientState";
import { resumeFileStore } from "@/server/resume/files";
import { quickPlan } from "./quickFill";

const dna: CareerDNA = {
  ...EMPTY_DNA,
  name: "Kunal Example",
  history: {
    contact: { email: "k@example.com", phone: "+91 90000 00000", location: "Mumbai, India" },
    experience: [{ id: "x1", employer: "Nomura", title: "Senior Engineering Manager", startDate: "2025-12", current: true, bullets: [], provenance: "RESUME_IMPORTED" }],
    education: [{ id: "e1", institution: "IIT Kanpur", degree: "B.Tech.", startDate: "2001-07", endDate: "2005-05", provenance: "RESUME_IMPORTED" }],
    certifications: [],
    projects: [],
    publications: [],
    researchInterests: [],
  },
  updatedAt: "2026-10-09T00:00:00Z",
};
const f = (id: string, label: string, over: Partial<ApplicationField> = {}): ApplicationField => ({ id, label, type: "text", required: true, step: 1, ...over });
const form = {
  signals: [] as string[],
  fields: [
    f("fn", "First name"),
    f("uni", "University", { hints: { section: "Education 1" } }),
    f("deg", "Type of degree", { type: "select", options: [{ label: "Bachelor's Degree", value: "b" }, { label: "Master's Degree", value: "m" }], hints: { section: "Education 1" } }),
    f("state", "State/Province"),
    f("zip", "Zip/Postal code"),
    f("cv", "Resume/CV", { type: "file" }),
    f("eeo", "Gender", { type: "select", options: [{ label: "Male", value: "m" }, { label: "Female", value: "f" }] }),
    f("ctc", "Expected CTC (Lacs)"),
  ],
};
const noModel = vi.fn(async () => null);

async function seed(tenant: string, over: { policy?: Record<string, string> } = {}) {
  await writeClientState(tenant, "wj.career", 1, { dna, onboarded: true, answerMemory: [{ key: "salaryExpectation", value: "₹60,00,000", confirmedAt: "2026-10-05T00:00:00Z", source: "USER_PROVIDED" }] } as never);
  await writeClientState(tenant, "wj.automation", 2, { policy: { ...defaultPolicy(), ...(over.policy ?? {}) }, defaultLevel: "guided" } as never);
}

describe("quick plan — Fill on a page with no WonderJobs application", () => {
  it("fills from the Career Profile, CV history, saved answers and latest résumé; leaves the rest to the candidate", async () => {
    await seed("t-quick-1");
    await resumeFileStore().save("t-quick-1", { filename: "Kunal_CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 test") });
    const plan = await quickPlan("t-quick-1", form, { match: noModel, now: Date.parse("2026-10-09T08:00:00Z") });
    const byId = Object.fromEntries(plan.fills.map((x) => [x.fieldId, x]));
    expect(plan.allowed).toBe(true);
    expect(byId.fn).toMatchObject({ value: "Kunal" });
    expect(byId.uni).toMatchObject({ value: "IIT Kanpur" });
    expect(byId.deg).toMatchObject({ value: "b" });
    expect(byId.state).toMatchObject({ value: "Maharashtra" });
    expect(byId.ctc).toMatchObject({ value: "60" });
    expect(byId.cv).toMatchObject({ file: "resume" });
    expect(plan.resume).toMatchObject({ filename: "Kunal_CV.pdf", mime: "application/pdf" });
    // Never filled: a demographic question, and a value the candidate never gave.
    expect(byId.eeo).toBeUndefined();
    expect(byId.zip).toBeUndefined();
    expect(plan.needsYou.map((n) => n.label)).toEqual(expect.arrayContaining(["Gender", "Zip/Postal code"]));
  });

  it("refuses when filling is turned off in Automation", async () => {
    await seed("t-quick-2", { policy: { fill_application: "off" } });
    expect(await quickPlan("t-quick-2", form, { match: noModel })).toMatchObject({ allowed: false, fills: [] });
  });

  it("never fills a payment page", async () => {
    await seed("t-quick-3");
    expect(await quickPlan("t-quick-3", { ...form, signals: ["payment"] }, { match: noModel })).toMatchObject({ allowed: false, fills: [] });
  });

  it("reads only the asking candidate's data", async () => {
    await seed("t-quick-4");
    const other = await quickPlan("t-quick-empty", form, { match: noModel });
    expect(other.fills.find((x) => x.fieldId === "uni")).toBeUndefined();
    expect(other.resume).toBeUndefined();
  });

  it("hands the open question to the model's matcher with the candidate's own facts available to name", async () => {
    await seed("t-quick-5");
    const match = vi.fn(async (s: { pack: { profile: Record<string, unknown> } }) => (s ? null : null));
    await quickPlan("t-quick-5", { signals: [], fields: [f("q", "Which university did you attend for undergrad?")] }, { match });
    const arg = match.mock.calls[0][0];
    // aiMatch offers the model these facts' names only, never their values (see aiMatch.ts).
    expect(arg.pack.profile.university).toBeDefined();
  });
});
