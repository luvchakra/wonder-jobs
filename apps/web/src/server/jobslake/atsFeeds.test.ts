import { describe, expect, it } from "vitest";
import { parsePersonio, rawFromPersonio, PERSONIO_COMPANIES } from "./personio";
import { rawFromRecruitee, RECRUITEE_COMPANIES } from "./recruitee";
import { normalizePosting } from "@/services/jobs/normalize";

// Shapes as the live feeds answered on 2026-11-05 (WJ-550).
const XML = `<?xml version="1.0" encoding="UTF-8"?><workzag-jobs>
<position>
  <id>2573573</id>
  <subcompany>ottonova Krankenversicherung AG</subcompany>
  <office>München</office>
  <additionalOffices><office>Köln</office></additionalOffices>
  <department>Risk Management &amp; Actuary</department>
  <name>(Senior) Aktuar (m/w/d)</name>
  <jobDescriptions>
    <jobDescription><name>Your tasks</name><value><![CDATA[<p>Model <b>Solvency II</b> risk.</p>]]></value></jobDescription>
    <jobDescription><name>Your profile</name><value><![CDATA[<ul><li>Actuary</li></ul>]]></value></jobDescription>
  </jobDescriptions>
  <employmentType>permanent</employmentType>
  <seniority>experienced</seniority>
  <schedule>full-or-part-time</schedule>
  <keywords>Solvency 2,Aktuariat</keywords>
  <createdAt>2026-03-23T15:24:29+00:00</createdAt>
</position>
<position><id></id><name>No id</name></position>
</workzag-jobs>`;

describe("Personio XML feed", () => {
  it("reads each position with its offices, description blocks, type and date; skips a position without an id", () => {
    const [p, ...rest] = parsePersonio(XML);
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({ id: "2573573", name: "(Senior) Aktuar (m/w/d)", office: "München", offices: ["Köln"], department: "Risk Management & Actuary", employmentType: "permanent", schedule: "full-or-part-time", keywords: ["Solvency 2", "Aktuariat"], createdAt: "2026-03-23T15:24:29+00:00" });
    expect(p.description).toContain("Your tasks");
    expect(p.description).toContain("Model Solvency II risk.");
    expect(p.description).not.toMatch(/<[a-z]/);
  });

  it("links each position to its own page on the company's Personio site", () => {
    const board = PERSONIO_COMPANIES.find((b) => b.slug === "ottonova")!;
    const raw = rawFromPersonio(board, parsePersonio(XML)[0]);
    expect(raw).toMatchObject({ externalId: "pz:ottonova:2573573", company: "ottonova", location: "München · Köln", applyUrl: "https://ottonova.jobs.personio.de/job/2573573", employerSite: true });
    expect(normalizePosting("personio", raw).title).toBe("(Senior) Aktuar (m/w/d)");
  });
});

describe("Recruitee Offers API", () => {
  it("reads an offer's place, date (UTC text), type and its careers page", () => {
    const board = RECRUITEE_COMPANIES.find((b) => b.slug === "bunq")!;
    const raw = rawFromRecruitee(board, { id: 7, title: "AML Manager, Austria", status: "published", published_at: "2026-10-30 16:32:58 UTC", careers_url: "https://careers.bunq.com/o/aml-manager-austria", company_name: "bunq", location: "Vienna, Wien, Austria", remote: false, employment_type_code: "fulltime_permanent", description: "<p>Fight <b>fraud</b>.</p>" });
    expect(raw).toMatchObject({ externalId: "rc:bunq:7", company: "bunq", location: "Vienna, Wien, Austria", remote: false, postedAt: "2026-10-30T16:32:58.000Z", applyUrl: "https://careers.bunq.com/o/aml-manager-austria", jobType: "fulltime_permanent", employerSite: true });
    expect(raw.description).toMatch(/^Fight fraud\s?\.$/);
  });

  it("says remote first when the offer is remote", () => {
    const raw = rawFromRecruitee(RECRUITEE_COMPANIES[0], { id: 8, title: "Engineer", careers_url: "https://x/o/e", city: "Amsterdam", country: "Netherlands", remote: true });
    expect(raw.location).toBe("Remote · Amsterdam, Netherlands");
  });
});
