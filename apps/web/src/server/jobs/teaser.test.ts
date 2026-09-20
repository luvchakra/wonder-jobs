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

  it("builds the full teaser — everything about the posting itself, not truncated or watered down", async () => {
    findJobByIdMock.mockResolvedValueOnce({
      id: "careers_abc123",
      sourceId: "careers",
      title: "Senior Product Manager",
      company: "Groww",
      companyDomain: "groww.in",
      location: "Bengaluru, India",
      workMode: "hybrid",
      salaryMin: 3_000_000,
      salaryMax: 4_000_000,
      currency: "INR",
      postedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      description: "A".repeat(300),
      requirements: ["5+ years of product management"],
      niceToHave: ["Fintech background"],
      skills: ["SQL", "Product Strategy"],
      industry: "Fintech",
      seniority: "senior",
      applyPath: "employer_site",
      onEmployerSite: true,
      repostCount: 0,
    });
    const teaser = await publicJobTeaser("/app/jobs/careers_abc123");
    expect(teaser).toMatchObject({ title: "Senior Product Manager", company: "Groww", companyDomain: "groww.in", location: "Bengaluru, India", workMode: "hybrid", sourceName: "Company career sites", industry: "Fintech", seniority: "senior" });
    expect(teaser?.salary).toBe("₹30L–40L");
    // The full description, not a preview — an anonymous visitor sees the whole real posting.
    expect(teaser?.description).toHaveLength(300);
    expect(teaser?.requirements).toEqual(["5+ years of product management"]);
    expect(teaser?.skills).toEqual(["SQL", "Product Strategy"]);
    // The hiring-quality signals a signed-in candidate would see too — they're computed from the posting alone.
    expect(teaser?.quality.signals.length).toBeGreaterThan(0);
    expect(teaser?.quality.signals.find((s) => s.key === "employer_site")?.value).toBe("Listed on employer site");
  });

  it("has no salary field when the posting didn't disclose one — never a fabricated figure", async () => {
    findJobByIdMock.mockResolvedValueOnce({
      id: "remotive_xyz",
      sourceId: "remotive",
      title: "Staff Engineer",
      company: "Acme",
      location: "Remote (Worldwide)",
      workMode: "remote",
      currency: "USD",
      postedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      description: "Build reliable systems for millions of users.",
      requirements: [],
      niceToHave: [],
      skills: [],
      industry: "Technology",
      seniority: "mid",
    });
    const teaser = await publicJobTeaser("/app/jobs/remotive_xyz");
    expect(teaser?.description).toBe("Build reliable systems for millions of users.");
    expect(teaser?.salary).toBeNull();
    expect(teaser?.quality.signals.find((s) => s.key === "salary_transparency")?.value).toBe("Salary not provided");
  });
});
