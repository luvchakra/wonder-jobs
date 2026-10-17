import { beforeAll, describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { jobIdFromAtsUrl } from "@/services/jobs/atsUrl";
import { readClientState, writeClientState } from "@/server/clientState";
import { signExtensionToken } from "@/server/extensionToken";
import { POST as readRoute } from "@/app/api/extension/job/read/route";
import { POST as saveRoute } from "@/app/api/extension/job/save/route";
import { canonicalJobUrl, jobFromPage, readPageJob, savePageJob, type PageJob } from "./pageJob";

const now = Date.parse("2026-10-11T09:00:00Z");
const dna: CareerDNA = {
  ...EMPTY_DNA,
  name: "K",
  headline: "Director, Identity and Access Management",
  careerGoal: "Senior Director, identity and access management",
  skills: [
    { name: "IAM", level: 5 },
    { name: "SailPoint", level: 4 },
    { name: "Okta", level: 4 },
  ] as CareerDNA["skills"],
  preferredLocations: ["Mumbai"],
  updatedAt: "2026-10-01T00:00:00Z",
};

const page = (over: Partial<PageJob> = {}): PageJob => ({
  url: "https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=iam&utm_source=x",
  via: "linkedin",
  title: "Senior Director, Identity and Access Management",
  company: "Acme Bank",
  location: "Mumbai, Maharashtra, India",
  description: "Lead IAM strategy. SailPoint and Okta experience. Identity governance across the bank.",
  ...over,
});

const jobsDoc = (t: string) => readClientState<{ jobs?: Record<string, CanonicalJob>; saved?: Record<string, string> }>(t, "wj.jobs");
const appsDoc = (t: string) => readClientState<{ applications?: Record<string, Application> }>(t, "wj.applications");

beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-extension-tokens";
});

describe("the job on the candidate's page", () => {
  it("keeps the posting's own address: LinkedIn's search view becomes the job's page, tracking goes", () => {
    expect(canonicalJobUrl("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=iam")).toBe("https://www.linkedin.com/jobs/view/4012345678/");
    expect(canonicalJobUrl("https://careers.acme.com/jobs/123?utm_source=li&gh_jid=987#apply")).toBe("https://careers.acme.com/jobs/123?gh_jid=987");
  });

  it("gives an ATS page the same id a search gives that posting, so it's never kept twice", () => {
    const url = "https://boards.greenhouse.io/acme/jobs/4567";
    expect(jobFromPage(page({ url, via: "jsonld" }), now).id).toBe(jobIdFromAtsUrl(url));
  });

  it("asks for the profile instead of inventing a score when Career DNA is empty", async () => {
    await writeClientState("t-pj-empty", "wj.career", 1, { dna: EMPTY_DNA } as never);
    const v = await readPageJob("t-pj-empty", page(), now);
    expect(v.needsProfile).toBe(true);
    expect(v.match).toBeNull();
  });

  it("scores the posting against the candidate's Career DNA and says where it was read", async () => {
    await writeClientState("t-pj-read", "wj.career", 1, { dna } as never);
    const v = await readPageJob("t-pj-read", page(), now);
    expect(v.needsProfile).toBe(false);
    expect(v.match!.score).toBeGreaterThan(50);
    expect(v.readFrom).toBe("linkedin.com");
    expect(v.application).toBeNull();
    // Reading writes nothing.
    expect(await jobsDoc("t-pj-read")).toBeUndefined();
    expect(await appsDoc("t-pj-read")).toBeUndefined();
  });

  it("saves the job and a Saved application once; saving again changes nothing", async () => {
    await writeClientState("t-pj-save", "wj.career", 1, { dna } as never);
    await writeClientState("t-pj-save", "wj.jobs", 2, { saved: {}, rejected: {}, sort: "match" } as never);
    const first = await savePageJob("t-pj-save", page(), now);
    expect(first.created).toBe(true);
    expect(first.application).toMatchObject({ status: "saved" });
    const jobs = await jobsDoc("t-pj-save");
    expect(jobs!.jobs![first.jobId]).toMatchObject({ title: "Senior Director, Identity and Access Management", applyUrl: "https://www.linkedin.com/jobs/view/4012345678/" });
    expect(jobs!.saved![first.jobId]).toBeTruthy();
    // Other parts of the jobs document are left as they were.
    expect((jobs as { sort?: string }).sort).toBe("match");
    const apps = Object.values((await appsDoc("t-pj-save"))!.applications!);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ jobId: first.jobId, status: "saved", submissionKey: `submit:${first.jobId}:me` });
    expect(apps[0].events[0].title).toBe("Saved from linkedin.com with the browser helper");

    const again = await savePageJob("t-pj-save", page({ url: "https://www.linkedin.com/jobs/view/4012345678/?trk=abc" }), now);
    expect(again.created).toBe(false);
    expect(Object.values((await appsDoc("t-pj-save"))!.applications!)).toHaveLength(1);
    expect((await readPageJob("t-pj-save", page(), now)).application).toMatchObject({ id: apps[0].id, status: "saved" });
  });

  it("finds an application the candidate already has for the same posting, found by a search", async () => {
    await writeClientState("t-pj-known", "wj.career", 1, { dna } as never);
    const app = { id: "app_1", jobId: "remotive_abc", status: "submitted", createdAt: "2026-10-01T00:00:00Z", appliedAt: "2026-10-02T00:00:00Z", artifacts: [], events: [], followUps: [], submissionKey: "submit:remotive_abc:me", job: { applyUrl: "https://careers.acme.com/jobs/123?utm_source=remotive" } };
    await writeClientState("t-pj-known", "wj.applications", 1, { applications: { app_1: app } } as never);
    const v = await readPageJob("t-pj-known", page({ url: "https://careers.acme.com/jobs/123", via: "jsonld" }), now);
    expect(v.application).toMatchObject({ id: "app_1", status: "submitted", since: "2026-10-02T00:00:00Z" });
    expect(v.application!.statusLabel).toBeTruthy();
    expect(v.jobId).toBe("remotive_abc");
    const s = await savePageJob("t-pj-known", page({ url: "https://careers.acme.com/jobs/123", via: "jsonld" }), now);
    expect(s.created).toBe(false);
  });
});

describe("routes: token, validation and tenant isolation", () => {
  const post = (route: (r: Request) => Promise<Response>, body: unknown, token?: string) =>
    route(new Request("http://localhost/api/extension/job/x", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

  it("refuses without the extension token", async () => {
    expect((await post(readRoute, page())).status).toBe(401);
    expect((await post(saveRoute, page())).status).toBe(401);
  });

  it("refuses something that isn't a job posting", async () => {
    const { token } = signExtensionToken("t-pj-route-a");
    expect((await post(readRoute, { url: "not a url", via: "page", title: "x" }, token)).status).toBe(400);
  });

  it("saves only into the token's own tenant", async () => {
    await writeClientState("t-pj-route-a", "wj.career", 1, { dna } as never);
    await writeClientState("t-pj-route-b", "wj.career", 1, { dna } as never);
    const a = signExtensionToken("t-pj-route-a").token;
    const b = signExtensionToken("t-pj-route-b").token;
    const saved = await post(saveRoute, page(), a);
    expect(saved.status).toBe(201);
    expect(Object.keys((await appsDoc("t-pj-route-a"))!.applications!)).toHaveLength(1);
    expect(await appsDoc("t-pj-route-b")).toBeUndefined();
    const other = await (await post(readRoute, page(), b)).json();
    expect(other.application).toBeNull();
  });
});

describe("the side panel's company logo", () => {
  it("comes from JobsLake's directory for a company it recorded, and is absent otherwise", async () => {
    const { __MemoryCompanies, __setCompanyStore } = await import("@/server/jobslake/companies");
    const store = new __MemoryCompanies();
    __setCompanyStore(store);
    try {
      const before = await readPageJob("t-pj-logo", page(), now);
      expect(before.logo).toBeUndefined();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...new Array(300).fill(1)]).toString("base64");
      const company = page().company;
      await store.upsert([{ domain: "acme-identity.com", name: company, nameKey: (await import("@/domain/jobslake/companies")).companyKey(company), sources: ["greenhouse"], firstSeenAt: "2026-10-01T00:00:00Z", lastSeenAt: "2026-10-01T00:00:00Z" }]);
      await store.setLogo("acme-identity.com", { data: png, type: "image/png", from: "acme-identity.com" }, new Date(now).toISOString());
      const after = await readPageJob("t-pj-logo", page(), Date.now());
      expect(after.logo).toBe(`data:image/png;base64,${png}`);
    } finally {
      __setCompanyStore(undefined);
    }
  });
});
