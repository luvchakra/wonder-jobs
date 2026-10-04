import { describe, expect, it } from "vitest";
import { museLocation, rawFromJazzFeed, rawFromMuse, rawFromSmartRecruiters, SMARTRECRUITERS_COMPANIES } from "./providers";

describe("rawFromSmartRecruiters", () => {
  const swiggy = SMARTRECRUITERS_COMPANIES[0];
  it("maps a posting as the API returns it, with the employer's own apply page", () => {
    const raw = rawFromSmartRecruiters(swiggy, { id: "6000000001459252", name: "Account Manager", releasedDate: "2026-10-03T11:08:36.851Z", location: { city: "Goa", country: "in", remote: false, hybrid: false }, typeOfEmployment: { label: "Full-time" }, experienceLevel: { label: "Not Applicable" }, applyUrl: "https://jobs.smartrecruiters.com/SWIGGY/6000000001459252-account-manager?oga=true", jobAd: { sections: { jobDescription: { text: "<p>Role Summary - owns the city.</p>" }, qualifications: { text: "<p>5 years</p>" } } } });
    expect(raw).toMatchObject({ externalId: "sr:Swiggy:6000000001459252", title: "Account Manager", company: "Swiggy", companyDomain: "swiggy.com", location: "Goa, India", remote: false, applyUrl: "https://jobs.smartrecruiters.com/SWIGGY/6000000001459252-account-manager?oga=true", employerSite: true, applyPath: "employer_site" });
    expect(raw.description).toContain("Role Summary - owns the city.");
    expect(raw.description).toContain("5 years");
    expect(raw.tags).toEqual(["Full-time"]);
  });
  it("falls back to the public posting URL and a one-line description when the detail call failed", () => {
    const raw = rawFromSmartRecruiters(swiggy, { id: "1", name: "Engineering Manager", location: { city: "Bengaluru", country: "in", hybrid: true }, department: { label: "Engineering" } });
    expect(raw.applyUrl).toBe("https://jobs.smartrecruiters.com/Swiggy/1");
    expect(raw.location).toBe("Bengaluru, India · Hybrid");
    expect(raw.description).toBe("Engineering Manager — Engineering");
  });
});

describe("rawFromMuse", () => {
  it("maps a Muse listing; remote is read from its places; it applies on The Muse", () => {
    const raw = rawFromMuse({ id: 42, name: "Senior Product Manager", publication_date: "2026-09-30T00:00:00Z", contents: "<p>Own the roadmap.</p>", locations: [{ name: "Bengaluru, India" }, { name: "Flexible / Remote" }], levels: [{ name: "Senior Level" }], categories: [{ name: "Product" }], refs: { landing_page: "https://www.themuse.com/jobs/acme/senior-product-manager" }, company: { name: "Acme" } });
    expect(raw).toMatchObject({ externalId: "muse:https://www.themuse.com/jobs/acme/senior-product-manager", title: "Senior Product Manager", company: "Acme", location: "Bengaluru, India", remote: false, description: "Own the roadmap.", applyUrl: "https://www.themuse.com/jobs/acme/senior-product-manager", seniorityHint: "Senior Level", industryHint: "Product", employerSite: false, applyPath: "platform" });
    expect(raw.tags).toEqual(["Product", "Senior Level"]);
  });
  it("is remote only when every listed place is remote, and names only the fixed places otherwise", () => {
    expect(rawFromMuse({ id: 1, name: "x", publication_date: "", locations: [{ name: "Flexible / Remote" }] })).toMatchObject({ remote: true, location: "Remote" });
    expect(rawFromMuse({ id: 2, name: "x", publication_date: "", locations: [{ name: "Flexible / Remote" }, { name: "Austin, TX" }] })).toMatchObject({ remote: false, location: "Austin, TX" });
  });
  it("asks The Muse for places by its own names", () => {
    expect(museLocation("Bengaluru")).toBe("Bangalore, India");
    expect(museLocation("Gurugram")).toBe("Gurgaon, India");
    expect(museLocation("Pune")).toBe("Pune, India");
    expect(museLocation("London, United Kingdom")).toBe("London, United Kingdom");
  });
});

describe("JazzHR feed", () => {
  const xml = `<?xml version="1.0"?><jobs><company>Eclipse Foundation, Inc.</company>
  <job><id>job_20260820192623_KFUNIZLPMWNMOTHF</id><status>Open</status><title>Front-End Web Developer (Remote)</title><department></department>
  <url>https://eclipsefoundation.applytojob.com/apply/9on6pUD4qF/FrontEnd-Web-Developer</url><city>Ottawa</city><state>ON</state><country>Canada</country>
  <type>Full Time</type><experience>Mid Level</experience><description>&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;</description></job>
  <job><id>job_20260101000000_CLOSED</id><status>Closed</status><title>Old role</title><url>https://x.applytojob.com/apply/1</url></job>
  </jobs>`;

  it("reads open jobs with the employer's page, place, and the posting date from the job id", () => {
    const jobs = rawFromJazzFeed("eclipsefoundation", xml);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      externalId: "jz:eclipsefoundation:job_20260820192623_KFUNIZLPMWNMOTHF",
      title: "Front-End Web Developer (Remote)",
      company: "Eclipse Foundation, Inc.",
      location: "Remote · Ottawa, ON, Canada",
      remote: true,
      postedAt: "2026-08-20T19:26:23Z",
      applyUrl: "https://eclipsefoundation.applytojob.com/apply/9on6pUD4qF/FrontEnd-Web-Developer",
      tags: ["Full Time", "Mid Level"],
      employerSite: true,
    });
    expect(jobs[0].description).toContain("<p>Build");
  });

  it("reads an empty or unknown feed as no jobs", () => {
    expect(rawFromJazzFeed("x", "<jobs><company>X</company></jobs>")).toEqual([]);
    expect(rawFromJazzFeed("x", "")).toEqual([]);
  });
});
