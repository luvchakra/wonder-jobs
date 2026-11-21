import { describe, expect, it, vi } from "vitest";

vi.mock("../jobs/recover", () => ({
  lookupJobs: vi.fn(async (ids: string[]) => (ids[0] === "job_1" ? [{ id: "job_1", title: "IAM Lead", company: "A bank", location: "Mumbai", workMode: "hybrid", description: "IAM Lead. Run identity for 40,000 people across the bank, with a team of twelve.", jobType: "full_time" }] : [])),
}));
vi.mock("../share/listing", () => ({
  sharedListing: vi.fn(async (module: string, id: string) => (module === "teaching" && id === "t_9" ? { module: "teaching", noun: "teaching job", title: "Physics teacher", facts: ["Grades 9–12", "Pune", null], details: "Teach physics to senior classes.", url: "/s/teaching/t_9" } : null)),
}));

import { listingPreview } from "./preview";

describe("a post's attached listing, as its page shows it", () => {
  it("reads a job or a module listing by its public page, and nothing else", async () => {
    expect(await listingPreview("/j/job_1")).toMatchObject({ module: "jobs", title: "IAM Lead", by: "A bank", image: "/j/job_1/opengraph-image" });
    expect((await listingPreview("/j/job_1"))?.summary).toMatch(/^Run identity/);
    expect(await listingPreview("/s/teaching/t_9")).toMatchObject({ module: "teaching", title: "Physics teacher", facts: "Grades 9–12 · Pune", summary: "Teach physics to senior classes." });
    expect(await listingPreview("/j/gone")).toBeNull();
    for (const bad of ["/app/settings", "https://evil.example/j/x", "/s/teaching/../x", "/j/a/b"]) expect(await listingPreview(bad)).toBeNull();
  });
});
