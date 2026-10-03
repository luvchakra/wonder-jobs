import { describe, expect, it } from "vitest";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { resumeOptionsFor } from "@/domain/jobs-apply/resumeOptions";
import { buildScheduledSearch } from "@/domain/workflow/simpleSchedule";
import type { UploadedResume } from "@/domain/resume/files";
import { baseResumeFor, canAddRole, MAX_ROLES, roleProblem, roleSearch, withoutResume, type CareerRole } from "./roles";

const role = (over: Partial<CareerRole> = {}): CareerRole => ({ id: "role_1", title: "Data Analyst", query: "", goal: "", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", ...over });
const upload = (id: string): UploadedResume => ({ id, filename: `${id}.pdf`, mime: "application/pdf", sizeBytes: 10, sha256: "0".repeat(64), uploadedAt: "2026-10-02T00:00:00.000Z" });

describe("a role's search", () => {
  it("uses the role's own terms and goal when given", () => {
    expect(roleSearch(role({ query: "data analyst OR BI analyst", goal: "Senior analyst roles in fintech" }), defaultSearchQuery)).toEqual({ query: "data analyst OR BI analyst", careerGoal: "Senior analyst roles in fintech" });
  });
  it("reads terms from the role's own name when none are given — never a canned default", () => {
    expect(roleSearch(role(), defaultSearchQuery)).toEqual({ query: "data analyst", careerGoal: "Data Analyst" });
  });
  it("comes back empty, for the page to ask, when nothing can be read", () => {
    expect(roleSearch(role({ title: "??" }), defaultSearchQuery).query).toBe("");
  });
});

describe("saving a role", () => {
  it("needs a name, keeps lengths sane, and refuses a duplicate name", () => {
    expect(roleProblem({ title: " ", query: "", goal: "" }, [])).toMatch(/name/);
    expect(roleProblem({ title: "x".repeat(81), query: "", goal: "" }, [])).toMatch(/80/);
    expect(roleProblem({ title: "PM", query: "q".repeat(121), goal: "" }, [])).toMatch(/120/);
    expect(roleProblem({ title: "PM", query: "", goal: "g".repeat(301) }, [])).toMatch(/300/);
    expect(roleProblem({ title: "data  analyst", query: "", goal: "" }, [role()])).toMatch(/already/);
    expect(roleProblem({ title: "Product Manager", query: "", goal: "" }, [role()])).toBeNull();
  });
  it(`allows up to ${MAX_ROLES}`, () => {
    expect(canAddRole(Array.from({ length: MAX_ROLES - 1 }, (_, i) => role({ id: `r${i}` })))).toBe(true);
    expect(canAddRole(Array.from({ length: MAX_ROLES }, (_, i) => role({ id: `r${i}` })))).toBe(false);
  });
});

describe("which résumé Apply offers first", () => {
  const base = { kind: "upload" as const, id: "rf_account" };
  it("the résumé of the role whose search found the job", () => {
    const roles = [role({ baseResume: { kind: "upload", id: "rf_analyst" } })];
    expect(baseResumeFor(roles, { id: "role_1", title: "Data Analyst" }, base)).toMatchObject({ ref: { id: "rf_analyst" }, role: { title: "Data Analyst" } });
  });
  it("the account's base résumé when the role has none, the role was deleted, or no role found the job", () => {
    expect(baseResumeFor([role()], { id: "role_1", title: "Data Analyst" }, base)).toEqual({ ref: base });
    expect(baseResumeFor([], { id: "role_1", title: "Data Analyst" }, base)).toEqual({ ref: base });
    expect(baseResumeFor([role({ baseResume: { kind: "upload", id: "rf_analyst" } })], undefined, base)).toEqual({ ref: base });
    expect(baseResumeFor(undefined, undefined, undefined)).toEqual({ ref: undefined });
  });
  it("labels and preselects it in Apply", () => {
    const o = resumeOptionsFor({ jobId: "j1", hasTailored: false, saved: [], uploads: [upload("rf_account"), upload("rf_analyst")], base: { kind: "upload", id: "rf_analyst" }, baseRoleTitle: "Data Analyst" });
    expect(o[0]).toMatchObject({ key: "upload:rf_analyst", label: "Your Data Analyst résumé — rf_analyst.pdf" });
    expect(o[1].label).toBe("rf_account.pdf");
  });
  it("a deleted résumé is cleared from every role that used it", () => {
    const roles = [role({ baseResume: { kind: "upload", id: "rf_x" } }), role({ id: "role_2", title: "PM", baseResume: { kind: "saved", id: "rf_x" } })];
    const after = withoutResume(roles, { kind: "upload", id: "rf_x" });
    expect(after[0].baseResume).toBeUndefined();
    expect(after[1].baseResume).toEqual({ kind: "saved", id: "rf_x" });
  });
});

describe("a scheduled search saved as a role", () => {
  const input = { ids: { workflow: "wf", schedule: "sch" }, now: new Date("2026-10-03T00:00:00Z"), timezone: "Asia/Kolkata", frequency: "daily" as const, onlyWhenWorthIt: true, careerGoal: "Senior analyst roles", query: "data analyst", locations: [], workModes: [], level: "guided" as const, provider: { provider: "wonderjobs" as const, billing: "platform" as const }, sourceIds: ["remotive"] };
  it("records the role, and says so in its name", () => {
    const { workflow } = buildScheduledSearch({ ...input, role: { id: "role_1", title: "Data Analyst" } });
    expect(workflow.config.role).toEqual({ id: "role_1", title: "Data Analyst" });
    expect(workflow.config.careerGoal).toBe("Senior analyst roles");
    expect(workflow.name).toContain("Data Analyst: data analyst");
  });
  it("without a role, is exactly as before", () => {
    const { workflow } = buildScheduledSearch(input);
    expect("role" in workflow.config).toBe(false);
    expect(workflow.name).toBe("Every day — data analyst");
  });
});
