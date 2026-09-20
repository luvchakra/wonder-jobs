import { describe, expect, it, vi } from "vitest";

const findJobByIdMock = vi.fn();
vi.mock("./lookup", () => ({ findJobById: (id: string) => findJobByIdMock(id) }));

import { jobIdFromNextPath, publicJobTeaser } from "./teaser";

describe("jobIdFromNextPath", () => {
  it("extracts the job id from a job detail path", () => {
    expect(jobIdFromNextPath("/app/jobs/careers_1bzrjhd")).toBe("careers_1bzrjhd");
    expect(jobIdFromNextPath("/app/jobs/careers_1bzrjhd?ref=email")).toBe("careers_1bzrjhd");
  });

  it("is null for anything that isn't a job detail link", () => {
    expect(jobIdFromNextPath(null)).toBeNull();
    expect(jobIdFromNextPath(undefined)).toBeNull();
    expect(jobIdFromNextPath("/app")).toBeNull();
    expect(jobIdFromNextPath("/app/jobs")).toBeNull();
    expect(jobIdFromNextPath("/app/runs/new")).toBeNull();
  });
});

describe("publicJobTeaser — the real, teaser-safe subset shown to an anonymous visitor", () => {
  it("is null when the next path isn't a job link, without looking anything up", async () => {
    expect(await publicJobTeaser("/app")).toBeNull();
    expect(findJobByIdMock).not.toHaveBeenCalled();
  });

  it("is null, not a guess, when the job can no longer be found", async () => {
    findJobByIdMock.mockResolvedValueOnce(null);
    expect(await publicJobTeaser("/app/jobs/careers_dead")).toBeNull();
  });

  it("is null when the lookup itself fails, rather than throwing through the sign-in page", async () => {
    findJobByIdMock.mockRejectedValueOnce(new Error("upstream unavailable"));
    expect(await publicJobTeaser("/app/jobs/careers_abc")).toBeNull();
  });

  it("builds the teaser from the job's own real fields, truncating only the long description", async () => {
    findJobByIdMock.mockResolvedValueOnce({
      sourceId: "careers",
      title: "Senior Product Manager",
      company: "Groww",
      location: "Bengaluru, India",
      workMode: "hybrid",
      salaryMin: 3_000_000,
      salaryMax: 4_000_000,
      currency: "INR",
      postedAt: new Date().toISOString(),
      description: "A".repeat(300),
    });
    const teaser = await publicJobTeaser("/app/jobs/careers_abc123");
    expect(teaser).toMatchObject({ title: "Senior Product Manager", company: "Groww", location: "Bengaluru, India", workMode: "hybrid", sourceName: "Company career sites" });
    expect(teaser?.salary).toBe("₹30L–40L");
    expect(teaser?.descriptionPreview).toHaveLength(221);
    expect(teaser?.descriptionPreview.endsWith("…")).toBe(true);
  });

  it("leaves a short description untouched", async () => {
    findJobByIdMock.mockResolvedValueOnce({
      sourceId: "remotive",
      title: "Staff Engineer",
      company: "Acme",
      location: "Remote (Worldwide)",
      workMode: "remote",
      currency: "USD",
      postedAt: new Date().toISOString(),
      description: "Build reliable systems for millions of users.",
    });
    const teaser = await publicJobTeaser("/app/jobs/remotive_xyz");
    expect(teaser?.descriptionPreview).toBe("Build reliable systems for millions of users.");
    expect(teaser?.salary).toBeNull();
  });
});
