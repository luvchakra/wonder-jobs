import { describe, expect, it } from "vitest";
import { jobIdFromAtsUrl, parseAtsUrl } from "./atsUrl";
import { normalizePosting } from "./normalize";

describe("parseAtsUrl", () => {
  it("reads Greenhouse board URLs, including the newer and regional hosts", () => {
    expect(parseAtsUrl("https://boards.greenhouse.io/groww/jobs/4728765101")).toEqual({ ats: "greenhouse", slug: "groww", externalId: "gh:groww:4728765101" });
    expect(parseAtsUrl("https://job-boards.greenhouse.io/groww/jobs/4728765101")).toEqual({ ats: "greenhouse", slug: "groww", externalId: "gh:groww:4728765101" });
    // A real URL from the live API today — Greenhouse serves EU boards from their own subdomain.
    expect(parseAtsUrl("https://job-boards.eu.greenhouse.io/groww/jobs/4728765101")).toEqual({ ats: "greenhouse", slug: "groww", externalId: "gh:groww:4728765101" });
  });

  it("reads a Greenhouse embedded application form, where the board is in the query", () => {
    expect(parseAtsUrl("https://boards.greenhouse.io/embed/job_app?for=stripe&token=12345")).toEqual({ ats: "greenhouse", slug: "stripe", externalId: "gh:stripe:12345" });
  });

  it("reads Lever URLs, including the /apply step", () => {
    const expected = { ats: "lever", slug: "cred", externalId: "lv:cred:fa6c100a-0fe0-4892-a8a3-8d2169d5005e" };
    expect(parseAtsUrl("https://jobs.lever.co/cred/fa6c100a-0fe0-4892-a8a3-8d2169d5005e")).toEqual(expected);
    expect(parseAtsUrl("https://jobs.lever.co/cred/fa6c100a-0fe0-4892-a8a3-8d2169d5005e/apply")).toEqual(expected);
  });

  it("reads Ashby URLs", () => {
    expect(parseAtsUrl("https://jobs.ashbyhq.com/notion/abc-123")).toEqual({ ats: "ashby", slug: "notion", externalId: "ab:notion:abc-123" });
  });

  it("is null for anything that isn't an ATS posting page", () => {
    expect(parseAtsUrl("https://www.linkedin.com/jobs/view/123")).toBeNull();
    expect(parseAtsUrl("https://boards.greenhouse.io/groww")).toBeNull();
    expect(parseAtsUrl("not a url")).toBeNull();
  });
});

describe("jobIdFromAtsUrl", () => {
  it("produces exactly the id normalizePosting gives the same posting — the whole point of the mapping", () => {
    // What `providers.ts`'s greenhouseBoard writes for this posting:
    const job = normalizePosting("careers", { externalId: "gh:groww:4728765101", title: "Engineer", company: "Groww", location: "Bengaluru", description: "", applyUrl: "https://job-boards.eu.greenhouse.io/groww/jobs/4728765101", employerSite: true });
    expect(jobIdFromAtsUrl("https://job-boards.eu.greenhouse.io/groww/jobs/4728765101")).toBe(job.id);
  });

  it("matches for Lever too", () => {
    const job = normalizePosting("careers", { externalId: "lv:cred:abc", title: "Engineer", company: "CRED", location: "Bengaluru", description: "", applyUrl: "https://jobs.lever.co/cred/abc", employerSite: true });
    expect(jobIdFromAtsUrl("https://jobs.lever.co/cred/abc/apply")).toBe(job.id);
  });
});
