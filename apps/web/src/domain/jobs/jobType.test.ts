import { describe, expect, it } from "vitest";
import { jobTypeFromTitle, jobTypeOf, readJobType, readJobTypeWords, resolveJobType, retypeFromTitle } from "./jobType";

describe("readJobType — a source's own employment-type field", () => {
  it("reads each source's spelling", () => {
    expect(readJobType("Part Time")).toBe("part_time"); // Himalayas
    expect(readJobType("FullTime")).toBe("full_time"); // Ashby
    expect(readJobType("part_time")).toBe("part_time"); // Remotive, Adzuna contract_time
    expect(readJobType(["full-time"])).toBe("full_time"); // Jobicy
    expect(readJobType("Contractor")).toBe("contract");
    expect(readJobType("Intern")).toBe("internship");
    expect(readJobType("Temporary")).toBe("temporary");
    expect(readJobType("freelance")).toBe("gig");
    expect(readJobType(["permanent", "full_time"])).toBe("full_time"); // Adzuna
  });
  it("takes the most specific of several values", () => {
    expect(readJobType(["full_time", "contract"])).toBe("contract");
    expect(readJobType(["part_time", "contract"])).toBe("part_time");
  });
  it("says nothing when the field names no job type", () => {
    expect(readJobType(undefined)).toBeUndefined();
    expect(readJobType("")).toBeUndefined();
    expect(readJobType(["berufserfahren"])).toBeUndefined();
    expect(readJobType([null, undefined])).toBeUndefined();
  });
});

describe("jobTypeFromTitle — only a title that says so", () => {
  it("reads a stated type", () => {
    expect(jobTypeFromTitle("Part-time Barista")).toBe("part_time");
    expect(jobTypeFromTitle("Freelance Illustrator")).toBe("gig");
    expect(jobTypeFromTitle("Marketing Intern")).toBe("internship");
    expect(jobTypeFromTitle("Seasonal Warehouse Associate")).toBe("temporary");
    expect(jobTypeFromTitle("Contract Java Developer")).toBe("contract");
    expect(jobTypeFromTitle("Java Developer (Contract)")).toBe("contract");
  });
  it("doesn't mistake a role for a type, or assume full-time", () => {
    expect(jobTypeFromTitle("Contract Manager")).toBeUndefined();
    expect(jobTypeFromTitle("Senior Contract Manager")).toBeUndefined();
    expect(jobTypeFromTitle("Internal Audit Lead")).toBeUndefined();
    expect(jobTypeFromTitle("Full Stack Engineer")).toBeUndefined();
    expect(jobTypeFromTitle("Product Manager")).toBeUndefined();
    expect(jobTypeFromTitle("Full-time Product Manager")).toBeUndefined();
  });
});

describe("resolveJobType / jobTypeOf", () => {
  it("prefers the source's field, says where the type came from, and leaves it unset when nothing says", () => {
    expect(resolveJobType("Part Time", "Designer")).toEqual({ jobType: "part_time", jobTypeFrom: "source" });
    expect(resolveJobType(null, "Freelance Designer")).toEqual({ jobType: "gig", jobTypeFrom: "title" });
    expect(resolveJobType(null, "Designer")).toEqual({});
  });
  it("reads an older entry's title when it has no type of its own", () => {
    expect(jobTypeOf({ title: "Part-time Tutor" })).toBe("part_time");
    expect(jobTypeOf({ title: "Tutor", jobType: "contract" })).toBe("contract");
    expect(jobTypeOf({ title: "Tutor" })).toBeUndefined();
  });
});

describe("readJobTypeWords — job-type words in a search", () => {
  it("takes them out of the role words", () => {
    expect(readJobTypeWords("part time designer jobs")).toEqual({ types: ["part_time"], from: "part time", rest: "designer jobs" });
    expect(readJobTypeWords("freelance gigs")).toMatchObject({ types: ["gig"], rest: "" });
    expect(readJobTypeWords("marketing internship in Pune")).toMatchObject({ types: ["internship"], rest: "marketing in Pune" });
    expect(readJobTypeWords("contract roles in data")).toMatchObject({ types: ["contract"], rest: "roles in data" });
  });
  it("leaves a role that only looks like one alone", () => {
    expect(readJobTypeWords("contract manager")).toEqual({ types: [], from: "", rest: "contract manager" });
    expect(readJobTypeWords("product manager")).toMatchObject({ types: [] });
  });
});

describe("consultant — a consulting engagement, only when it's said", () => {
  it("reads a source's own field", () => {
    expect(readJobType("Consultant")).toBe("consultant");
    expect(readJobType(["Consulting"])).toBe("consultant");
    expect(readJobType("Contract")).toBe("contract");
  });

  it("reads a title that states the engagement, never the job title alone", () => {
    expect(jobTypeFromTitle("SAP Architect (Consultant)")).toBe("consultant");
    expect(jobTypeFromTitle("Security Architect – Consulting")).toBe("consultant");
    expect(jobTypeFromTitle("Independent Consultant, Identity Governance")).toBe("consultant");
    expect(jobTypeFromTitle("Fractional consultant, CISO")).toBe("consultant");
    expect(jobTypeFromTitle("IAM Engineer on a consultant basis")).toBe("consultant");
    expect(jobTypeFromTitle("Senior Consultant")).toBeUndefined();
    expect(jobTypeFromTitle("Management Consultant, Strategy")).toBeUndefined();
    expect(jobTypeFromTitle("Consulting Manager")).toBeUndefined();
  });

  it("reads consulting words in a search", () => {
    expect(readJobTypeWords("consulting work in identity").types).toEqual(["consultant"]);
    expect(readJobTypeWords("consultant roles, remote").types).toEqual(["consultant"]);
    expect(readJobTypeWords("management consultant").types).toEqual([]);
  });
});

describe("a title over a source's Full-time (WJ-367)", () => {
  it("lets a title that names a narrower engagement win: interns, part-time, gigs, marked contracts, temps with a length", () => {
    expect(resolveJobType("Full-time", "Intern - Sales, Summer 2027 - Truck Tire")).toEqual({ jobType: "internship", jobTypeFrom: "title" });
    expect(resolveJobType("Full-time", "PT Marketing Intern")).toEqual({ jobType: "internship", jobTypeFrom: "title" });
    expect(resolveJobType("Full-time", "Customer Service Back Office Agent (6 Months Temporary)")).toEqual({ jobType: "temporary", jobTypeFrom: "title" });
    expect(resolveJobType("Full-time", "[SX/EIT-MM] AI/Agent Engineers (1-year contract)")).toEqual({ jobType: "contract", jobTypeFrom: "title" });
    expect(resolveJobType("Full-time", "Freelance Video Editor")).toEqual({ jobType: "gig", jobTypeFrom: "title" });
  });

  it("keeps the source's type when the title is only a role, or the source already said something narrower", () => {
    expect(resolveJobType("Full-time", "Temporary Accommodation Officer")).toEqual({ jobType: "full_time", jobTypeFrom: "source" });
    expect(resolveJobType("Full-time", "Senior Contract Manager")).toEqual({ jobType: "full_time", jobTypeFrom: "source" });
    expect(resolveJobType("Contract", "Intern - Sales")).toEqual({ jobType: "contract", jobTypeFrom: "source" });
  });

  it("reads contract terms written in brackets or with a length", () => {
    expect(jobTypeFromTitle("IT Manager (2-year renewable contract)")).toBe("contract");
    expect(jobTypeFromTitle("Data Engineer 12-month contract")).toBe("contract");
    expect(jobTypeFromTitle("Contracts Analyst")).toBeUndefined();
  });

  it("retypes a stored posting only where its type is missing or a contradicted Full-time", () => {
    expect(retypeFromTitle({ title: "Part-time Barista" })).toBe("part_time");
    expect(retypeFromTitle({ title: "Intern - Sales", jobType: "full_time", jobTypeFrom: "source" })).toBe("internship");
    expect(retypeFromTitle({ title: "Temporary Accommodation Officer", jobType: "full_time", jobTypeFrom: "source" })).toBeUndefined();
    expect(retypeFromTitle({ title: "Intern - Sales", jobType: "gig", jobTypeFrom: "source" })).toBeUndefined();
    expect(retypeFromTitle({ title: "Product Manager" })).toBeUndefined();
  });
});
