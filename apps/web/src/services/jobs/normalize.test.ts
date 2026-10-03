import { describe, expect, it } from "vitest";
import { corePhrase, defaultSearchQuery, extractRequirements, extractSkills, hasTerm, htmlToText, inferSeniority, inPlaces, matchesLocations, matchesQuery, normalizePosting, parseSalary, placeNamed, queryTerms, remoteOpenTo, sameFamily, stripSelfReference } from "./normalize";

describe("normalize", () => {
  it("strips HTML into readable text", () => {
    expect(htmlToText("<p>Hello&nbsp;<strong>world</strong></p><ul><li>one</li><li>two &amp; three</li></ul>")).toBe("Hello world\n- one\n- two & three");
  });

  it("finds skills from a lexicon without partial-word hits", () => {
    const skills = extractSkills("We need SQL, A/B testing and Product Strategy. Golang is a plus. Rust-free. Analytics dashboards.");
    expect(skills).toEqual(expect.arrayContaining(["SQL", "A/B Testing", "Product Strategy", "Analytics"]));
    expect(skills).not.toContain("Go");
    expect(skills).not.toContain("R");
  });

  it("infers seniority from titles", () => {
    expect(inferSeniority("Senior Product Manager")).toBe("senior");
    expect(inferSeniority("Group Product Manager")).toBe("lead");
    expect(inferSeniority("Director of Product")).toBe("director");
    expect(inferSeniority("Product Analyst Intern")).toBe("junior");
    expect(inferSeniority("Product Manager")).toBe("mid");
  });

  it("parses salary strings into annual figures", () => {
    expect(parseSalary("$90k - $120k")).toEqual({ min: 90_000, max: 120_000, currency: "USD" });
    expect(parseSalary("$90 - $150 /hour")).toEqual({ min: 180_000, max: 300_000, currency: "USD" });
    expect(parseSalary("₹25L – 40L per annum")).toEqual({ min: 2_500_000, max: 4_000_000, currency: "INR" });
    expect(parseSalary("Competitive")).toEqual({ currency: undefined });
  });

  it("extracts requirement bullets under a requirements heading", () => {
    const text = "About the role\nShip things.\nRequirements\n- 5+ years of product management experience\n- Strong SQL and analytics skills\nNice to have\n- Fintech background\nBenefits\n- Health insurance";
    const r = extractRequirements(text);
    expect(r.requirements).toEqual(["5+ years of product management experience", "Strong SQL and analytics skills"]);
    expect(r.niceToHave).toEqual(["Fintech background"]);
  });

  it("normalizes a posting deterministically", () => {
    const job = normalizePosting(
      "remotive",
      { externalId: "123", title: " Senior  Product Manager ", company: "Acme", location: "Worldwide", remote: true, description: "<p>Own the roadmap. Requirements</p><ul><li>5+ years in product management</li></ul>", tags: ["product"], postedAt: "2026-09-10T00:00:00Z", applyUrl: "https://example.com/j/123", salaryText: "$100k - $130k", employerSite: false },
      Date.parse("2026-09-17T00:00:00Z"),
    );
    expect(job.id).toBe(normalizePosting("remotive", { externalId: "123", title: "x", company: "y", location: "", description: "", applyUrl: "", employerSite: false }).id);
    expect(job).toMatchObject({ title: "Senior Product Manager", seniority: "senior", workMode: "remote", country: "", salaryMin: 100_000, salaryMax: 130_000, currency: "USD", applyPath: "platform", onEmployerSite: false });
    expect(job.skills).toContain("Product Management");
    expect(job.requirements[0]).toMatch(/5\+ years/);
  });

  it("turns a plain-language goal into search terms and a core phrase", () => {
    expect(queryTerms("Find senior product roles at fintech companies")).toEqual(["senior", "product", "fintech"]);
    expect(corePhrase("Find senior product roles at fintech companies")).toBe("product");
    expect(corePhrase("Data scientist")).toBe("data scientist");
  });

  it("reads svp/evp/chief as seniority level, not a required title word — a real reported bug: 'senior director svp iam' matched nothing because titleMatches required the literal substring 'svp' in every posting's title", () => {
    expect(corePhrase("senior director svp iam")).toBe("iam");
    expect(corePhrase("evp of engineering")).toBe("engineering");
    expect(corePhrase("chief product officer")).toBe("product officer");
  });

  it("filters postings by query and location", () => {
    const pm = { title: "Product Manager, Payments", description: "", tags: [], skills: [], location: "Bengaluru, India", workMode: "onsite" as const, country: "IN" };
    const eng = { title: "Backend Engineer", description: "We build distributed storage infrastructure in Go", tags: [], skills: [], location: "Berlin", workMode: "onsite" as const, country: "DE" };
    expect(matchesQuery(pm, "senior product roles at fintech companies")).toBe(true);
    expect(matchesQuery({ ...eng, title: "Assistant Manager - Internal Audit" }, "senior product manager fintech")).toBe(false);
    expect(matchesQuery({ ...pm, title: "Product Growth Strategist", tags: ["Product Manager"] }, "senior product manager fintech")).toBe(true);
    expect(matchesQuery(eng, "senior product roles at fintech companies")).toBe(false);
    expect(matchesLocations(pm, ["Bengaluru", "Remote"])).toBe(true);
    expect(matchesLocations(eng, ["Bengaluru", "Remote"])).toBe(false);
    // A remote role restricted to somewhere else ("Remote - USA", or one that names only Berlin) is not open to a Bengaluru search.
    expect(matchesLocations({ ...eng, workMode: "remote" }, ["Bengaluru"])).toBe(false);
    expect(matchesLocations({ ...eng, location: "Remote - USA", workMode: "remote" }, ["Mumbai"])).toBe(false);
    expect(matchesLocations({ ...eng, location: "Remote", workMode: "remote" }, ["Mumbai"])).toBe(true);
    expect(matchesLocations({ ...eng, location: "", workMode: "remote" }, ["Mumbai"])).toBe(true);
    expect(matchesLocations({ ...eng, location: "Remote (Worldwide)", workMode: "remote" }, ["Mumbai"])).toBe(true);
    expect(matchesLocations({ ...eng, location: "Remote - USA", workMode: "remote" }, ["Remote"])).toBe(true);
    // A place's other name counts: The Muse and many boards say Bangalore.
    expect(matchesLocations({ ...pm, location: "Bangalore, India", country: "IN" }, ["Bengaluru"])).toBe(true);
    expect(remoteOpenTo({ location: "Remote (Americas only)", workMode: "remote" }, ["Bengaluru", "Remote"])).toBe(false);
    expect(remoteOpenTo({ location: "Remote (Worldwide)", workMode: "remote" }, ["Bengaluru"])).toBe(true);
    expect(remoteOpenTo({ location: "Remote (India, APAC)", workMode: "remote" }, ["Bengaluru, India"])).toBe(true);
  });
});

describe("defaultSearchQuery — the run searches for the candidate's own role, never a canned one", () => {
  it("prefers the headline, dropping industry qualifiers that Career DNA scores separately", () => {
    expect(defaultSearchQuery({ headline: "Product Manager · Consumer & Fintech", careerGoal: "Find product management roles" })).toBe("product manager");
  });

  it("falls back to the goal, and reads a leading 'I am' / 'iam' as the candidate, not as IAM", () => {
    expect(defaultSearchQuery({ headline: "", careerGoal: "iam senior director" })).toBe("senior director");
    expect(defaultSearchQuery({ headline: "", careerGoal: "I am a senior director of engineering" })).toBe("senior director engineering");
    expect(defaultSearchQuery({ headline: "", careerGoal: "I'm looking for product management roles in tech companies" })).toBe("product management");
  });

  it("keeps IAM written in capitals — it's the field, not “I am”", () => {
    expect(defaultSearchQuery({ headline: "Security engineer, IAM", careerGoal: "" })).toBe("security engineer iam");
    expect(stripSelfReference("IAM engineer roles")).toBe("IAM engineer roles");
    expect(defaultSearchQuery({ headline: "", careerGoal: "IAM director roles" })).toBe("iam director");
    expect(stripSelfReference("Iam a senior director")).toBe("senior director");
  });

  it("takes the field from the goal when the headline is only a level", () => {
    expect(defaultSearchQuery({ headline: "Senior Director", careerGoal: "identity and access management" })).toBe("senior director identity access");
    expect(defaultSearchQuery({ headline: "Senior Director", careerGoal: "" })).toBe("senior director");
  });

  it("is empty when there is nothing to derive from, so the product asks instead of inventing", () => {
    expect(defaultSearchQuery({ headline: "", careerGoal: "" })).toBe("");
    expect(defaultSearchQuery({ headline: "", careerGoal: "I want a new job" })).toBe("");
  });

  it("strips a headline's own meta-label ('Target:', 'Seeking:', 'Goal:') instead of searching for it literally — a real reported bug: a 'Target: Senior Director / SVP — …' headline searched for the literal word 'target', which returned zero postings on every source since no real job is titled 'Target …'", () => {
    expect(defaultSearchQuery({ headline: "Target: Senior Director / SVP — IAM & AI Transformation | Digital Identity, Cyber Risk & AI Governance", careerGoal: "" })).toBe("senior director svp iam");
    expect(defaultSearchQuery({ headline: "Seeking: Head of Data", careerGoal: "" })).toBe("head data");
    expect(defaultSearchQuery({ headline: "Goal - Staff Engineer, Platform", careerGoal: "" })).toBe("staff engineer platform");
  });
});

describe("word families and places", () => {
  it("matches other forms of a word, never a different word", () => {
    for (const [a, b] of [["psychology", "psychologist"], ["engineer", "engineering"], ["manager", "management"], ["design", "designer"], ["nurse", "nursing"], ["therapy", "therapist"], ["accountant", "accounting"], ["intern", "internship"], ["consultant", "consulting"], ["librarian", "library"]]) expect(sameFamily(a, b)).toBe(true);
    for (const [a, b] of [["product", "production"], ["intern", "internal"], ["account", "accounting"], ["program", "programmer"], ["director", "direct"], ["engineer", "engine"], ["office", "officer"], ["market", "marketing"]]) expect(sameFamily(a, b)).toBe(false);
    expect(hasTerm("Clinical Psychologist", "psychology")).toBe(true);
    expect(hasTerm("Williams & Co", "iam")).toBe(false);
    expect(matchesQuery({ title: "Counselling Psychologist", description: "", tags: [], skills: [] }, "psychology")).toBe(true);
  });

  it("narrows a list to places: the city by any of its names, or remote and open to it", () => {
    const at = (location: string, workMode: "remote" | "onsite" | "hybrid" = "onsite") => ({ location, workMode });
    expect(inPlaces(at("Bangalore, Karnataka"), ["Bengaluru"])).toBe(true);
    expect(inPlaces(at("Pune, India"), ["Mumbai"])).toBe(false);
    expect(inPlaces(at("Remote - USA", "remote"), ["Mumbai", "Remote"])).toBe(false);
    expect(inPlaces(at("Remote (India)", "remote"), ["Mumbai", "Remote"])).toBe(true);
    expect(inPlaces(at("Remote", "remote"), ["Mumbai"])).toBe(false);
    expect(placeNamed("Navi Mumbai, Maharashtra", "Mumbai")).toBe(true);
  });
});
