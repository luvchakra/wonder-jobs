import { describe, expect, it } from "vitest";
import { emailHref, shareFacts, shareMessage, shareUrl, whatsappHref, type ShareJob } from "./share";

const job: ShareJob = { id: "adzuna:42", title: "Database Administrator", company: "HR India Solutions", location: "Mumbai, Maharashtra", workMode: "onsite", salaryMin: 1_200_000, salaryMax: 1_500_000, currency: "INR", jobType: "full_time", jobTypeFrom: "source" };

describe("job sharing", () => {
  it("links to the job's public page", () => {
    expect(shareUrl("https://jobs.wonderapps.biz/", "adzuna:42")).toBe("https://jobs.wonderapps.biz/j/adzuna%3A42");
  });

  it("states only the posting's own facts, leaving out what it doesn't say", () => {
    expect(shareFacts(job)).toBe("Mumbai, Maharashtra · On-site · Full-time · ₹12L–15L");
    expect(shareFacts({ ...job, salaryMin: undefined, salaryMax: undefined, jobType: undefined })).toBe("Mumbai, Maharashtra · On-site");
  });

  it("composes an email with a subject, the job, its link and one line about WonderStar", () => {
    const m = shareMessage(job, "https://x/j/1", "https://x");
    expect(m.subject).toBe("Job you might like: Database Administrator at HR India Solutions");
    expect(m.body).toContain("See the job and apply: https://x/j/1");
    expect(m.body).toContain("Found with WonderStar");
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
});
