import { describe, expect, it } from "vitest";
import { emailHref, shareFacts, shareMessage, shareUrl, whatsappHref, type ShareJob } from "./share";

const job: ShareJob = { id: "adzuna:42", title: "Database Administrator", company: "HR India Solutions", location: "Mumbai, Maharashtra", workMode: "onsite", salaryMin: 1_200_000, salaryMax: 1_500_000, currency: "INR", jobType: "full_time", jobTypeFrom: "source" };

describe("job sharing", () => {
  it("links to the job's public page", () => {
    expect(shareUrl("https://works.wonderapps.biz/", "adzuna:42")).toBe("https://works.wonderapps.biz/j/adzuna%3A42");
  });

  it("states only the posting's own facts, leaving out what it doesn't say", () => {
    expect(shareFacts(job)).toBe("Mumbai, Maharashtra · On-site · Full-time · ₹12L–15L");
    expect(shareFacts({ ...job, salaryMin: undefined, salaryMax: undefined, jobType: undefined })).toBe("Mumbai, Maharashtra · On-site");
  });

  it("composes an email with a subject, the job, its link and one line about WonderWorks", () => {
    const m = shareMessage(job, "https://x/j/1", "https://x");
    expect(m.subject).toBe("Job you might like: Database Administrator at HR India Solutions");
    expect(m.body).toContain("See the job and apply: https://x/j/1");
    expect(m.body).toContain("Found with WonderWorks");
    const href = emailHref(m);
    expect(href.startsWith("mailto:?subject=Job%20you%20might%20like")).toBe(true);
    expect(decodeURIComponent(href.split("&body=")[1])).toBe(m.body);
  });

  it("ends the WhatsApp message with the link alone, so its preview is the job", () => {
    const m = shareMessage(job, "https://x/j/1", "https://x");
    expect(m.whatsapp.split("\n").at(-1)).toBe("https://x/j/1");
    expect(m.whatsapp.match(/https?:\/\//g)).toHaveLength(1);
    expect(whatsappHref(m)).toBe(`https://wa.me/?text=${encodeURIComponent(m.whatsapp)}`);
  });

  it("never carries the candidate's fit or score", () => {
    const m = shareMessage({ ...job, ...({ score: 87, fit: "strong" } as object) } as ShareJob, "https://x/j/1", "https://x");
    expect(JSON.stringify(m)).not.toMatch(/87|strong/i);
  });

  // The share image carries the details (owner, 2026-11-03: the message was too long); the message stays crisp.
  describe("stays crisp", () => {
    const full = { ...job, description: "We build payments infrastructure for millions of merchants across India.", skills: ["PostgreSQL", "Oracle RAC"], level: "senior", requirements: "7+ years with PostgreSQL" } as unknown as ShareJob;
    const summary = { hook: "Own the databases behind India's busiest payments rails.", highlights: ["Lead a team of 4 DBAs", "Hybrid, 3 days in Mumbai"], ai: true };

    it("never carries the description, skills, level or requirements", () => {
      const m = shareMessage(full, "https://x/j/1", "https://x", summary);
      for (const v of Object.values(m)) {
        expect(v).not.toMatch(/payments infrastructure|Oracle RAC|PostgreSQL|7\+ years|senior/i);
      }
    });

    it("carries the summary's hook in every message, and its highlights only in the email (which has no image)", () => {
      const m = shareMessage(full, "https://x/j/1", "https://x", summary);
      for (const k of ["whatsapp", "text", "x", "caption", "body"] as const) expect(m[k]).toContain(summary.hook);
      expect(m.body).toContain("• Lead a team of 4 DBAs");
      for (const k of ["whatsapp", "text", "x", "caption"] as const) expect(m[k]).not.toContain("Lead a team of 4 DBAs");
    });

    it("is a few short lines: role, facts, hook, a WonderWorks line and the link", () => {
      const m = shareMessage(full, "https://x/j/1", "https://x", summary);
      const lines = m.whatsapp.split("\n").filter((l) => l.trim());
      expect(lines).toEqual(["*Database Administrator at HR India Solutions*", "Mumbai, Maharashtra · On-site · Full-time · ₹12L–15L", summary.hook, "Thought of you for this one. Found with WonderWorks, the AI job-search agent.", "https://x/j/1"]);
    });

    it("leaves the hook out, with no empty gap, when there's no summary", () => {
      const m = shareMessage(full, "https://x/j/1", "https://x", null);
      expect(m.whatsapp).not.toMatch(/\n{3,}/);
      expect(m.whatsapp.split("\n").filter((l) => l.trim())).toHaveLength(4);
    });
  });
});
