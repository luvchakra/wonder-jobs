import { describe, expect, it } from "vitest";
import { ATS_RULES_VERSION, checkAts, type AtsFileSignals, type AtsInput } from "./check";
import type { HistoryDraft, ImportedExperience } from "@/domain/career/historyImport";

const role = (over: Partial<ImportedExperience> = {}): ImportedExperience => ({
  employer: "Example Payments",
  title: "Senior Product Manager",
  startDate: "2021-01",
  current: true,
  bullets: ["Led the wallet roadmap for 4 million users", "Cut checkout drop-off by 18% with A/B tests", "Built the analytics the team trusted"],
  from: "",
  by: "rules",
  ...over,
});

const signals = (over: Partial<AtsFileSignals> = {}): AtsFileSignals => ({ format: "pdf", pageCount: 2, imageCount: 0, multiColumn: false, fontsWithoutUnicode: 0, links: [], ...over });

const history = (over: Partial<HistoryDraft> = {}): HistoryDraft => ({
  contact: { email: { value: "a@example.com", from: "" }, phone: { value: "+91 98765 43210", from: "" }, location: { value: "Mumbai, India", from: "" }, linkedinUrl: { value: "https://linkedin.com/in/a", from: "" } },
  summary: { value: "Product manager with eight years building payments products for consumers and small businesses.", from: "" },
  experience: [role(), role({ employer: "ShopStack", title: "Product Manager", startDate: "2018-03", endDate: "2020-12", current: undefined })],
  education: [],
  certifications: [],
  ...over,
});

const input = (over: Partial<AtsInput> = {}): AtsInput => ({
  file: { name: "Asha-Verma-Resume.pdf", signals: signals() },
  text: "Asha Verma\nSummary\n" + "Product manager building payments products. ".repeat(20),
  readable: true,
  profile: { name: "Asha Verma", yearsExperience: 8, skills: ["Product Strategy", "SQL", "Analytics", "Payments", "A/B Testing", "Roadmapping"] },
  history: history(),
  outline: { headings: [{ kind: "summary", text: "Summary" }, { kind: "experience", text: "Experience" }, { kind: "education", text: "Education" }, { kind: "skills", text: "Skills" }], unreadRoles: [], unknownHeadings: [] },
  now: new Date("2026-10-03T00:00:00Z"),
  ...over,
});

const finding = (r: ReturnType<typeof checkAts>, id: string) => r.findings.find((f) => f.id === id)!;

describe("ATS readiness", () => {
  it("scores a clean, well-structured résumé 100, says which rules produced it, and shows no fixes", () => {
    const r = checkAts(input());
    expect(r.score).toBe(100);
    expect(r.rulesVersion).toBe(ATS_RULES_VERSION);
    expect(r.findings.every((f) => f.status === "pass" || f.status === "na")).toBe(true);
    expect(r.findings.every((f) => !f.fix && !f.evidence)).toBe(true);
    expect(r.categories.reduce((n, c) => n + c.possible, 0)).toBe(90); // Word-only checks (10 points) don't apply to a PDF
  });

  it("scores an unreadable (scanned) file 0, with one finding that says why", () => {
    const r = checkAts(input({ readable: false }));
    expect(r.score).toBe(0);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ id: "text_layer", status: "fail", severity: "fix_first" });
  });

  it("fails columns, garbled fonts, Word text boxes and contact details only in the header", () => {
    const r = checkAts(input({ file: { name: "Asha-Verma-Resume.docx", signals: signals({ format: "docx", multiColumn: true, docx: { tables: 1, textBoxes: 1, columns: 2, headerFooterText: "a@example.com · +91 98765 43210" } }) }, text: "Asha Verma\nExperience\n" + "Led the roadmap. ".repeat(40) }));
    expect(finding(r, "columns")).toMatchObject({ status: "fail", severity: "fix_first" });
    expect(finding(r, "tables").status).toBe("fail");
    expect(finding(r, "header_footer")).toMatchObject({ status: "fail", fix: { where: "file" } });
    const g = checkAts(input({ file: { signals: signals({ fontsWithoutUnicode: 2 }) } }));
    expect(finding(g, "glyphs").status).toBe("fail");
    expect(g.score).toBeLessThan(100);
  });

  it("names missing sections and contact details, and a LinkedIn that is only a hidden link", () => {
    const r = checkAts(input({ outline: { headings: [{ kind: "experience", text: "Experience" }], unreadRoles: [], unknownHeadings: [] }, history: history({ contact: { email: { value: "a@example.com", from: "" }, phone: { value: "+91 98765 43210", from: "" } } }), file: { name: "Asha-Verma-Resume.pdf", signals: signals({ links: ["https://www.linkedin.com/in/asha"] }) } }));
    expect(finding(r, "headings").detail).toMatch(/No Education, Skills heading/);
    expect(finding(r, "contact")).toMatchObject({ status: "warn" });
    expect(finding(r, "contact").detail).toMatch(/only behind a link/);
    expect(finding(r, "skills").status).toBe("fail");
  });

  it("flags roles that couldn't be read, out-of-order roles and mixed date styles, with the lines concerned", () => {
    const r = checkAts(input({ outline: { headings: input().outline.headings, unreadRoles: ["Somewhere — 2019 - 2020"], unknownHeadings: [] }, history: history({ experience: [role({ startDate: "2016", current: undefined, endDate: "2017" }), role({ employer: "Newer", startDate: "2022-01", current: undefined, endDate: "2023-01" })] }) }));
    expect(finding(r, "roles")).toMatchObject({ status: "warn", evidence: ["Somewhere — 2019 - 2020"] });
    expect(finding(r, "order").status).toBe("warn");
    expect(finding(r, "dates").status).toBe("warn");
  });

  it("judges achievements on numbers, action verbs, length and pronouns — and quotes the ones to fix", () => {
    const bullets = ["Responsible for the payments roadmap", "I worked with engineering on checkout", "Helped the team ship faster", "x".repeat(330)];
    const r = checkAts(input({ history: history({ experience: [role({ bullets }), role({ employer: "B", startDate: "2018-01", current: undefined, endDate: "2020-01", bullets })] }) }));
    expect(finding(r, "numbers")).toMatchObject({ status: "fail" });
    expect(finding(r, "numbers").fix?.text).toMatch(/never adds a number/);
    expect(finding(r, "verbs").status).toBe("fail");
    expect(finding(r, "verbs").evidence?.[0]).toBe("Responsible for the payments roadmap");
    expect(finding(r, "length").status).toBe("warn");
    expect(finding(r, "pronouns").status).toBe("warn");
  });

  it("recognises present-tense verbs for current roles", () => {
    const r = checkAts(input({ history: history({ experience: [role({ bullets: ["Integrates identity platforms across 20 apps", "Owns the IAM roadmap", "Drives adoption of AI tooling", "Sets multi-year strategy"] })] }) }));
    expect(finding(r, "verbs").status).toBe("pass");
  });

  it("says when an opening paragraph has no Summary heading, and suggests a clean file name", () => {
    const r = checkAts(input({ history: history({ summary: undefined }), outline: { ...input().outline, intro: "21+ years building identity programmes for banks and insurers across Asia and Europe." }, file: { name: "Asha_Verma_CV (1).pdf", signals: signals({ imageCount: 3 }) } }));
    expect(finding(r, "summary").detail).toMatch(/no “Summary” heading/);
    expect(finding(r, "filename").fix?.text).toContain("Asha-Verma-Resume.pdf");
    expect(finding(r, "images").status).toBe("warn");
  });

  it("allows three pages past 15 years, and not before", () => {
    expect(finding(checkAts(input({ file: { signals: signals({ pageCount: 3 }) }, profile: { ...input().profile, yearsExperience: 21 } })), "pages").status).toBe("pass");
    expect(finding(checkAts(input({ file: { signals: signals({ pageCount: 3 }) } })), "pages").status).toBe("warn");
    expect(finding(checkAts(input({ file: { signals: signals({ pageCount: 5 }) } })), "pages").status).toBe("fail");
  });

  it("leaves checks that don't apply out of the score instead of passing or failing them", () => {
    const r = checkAts(input({ file: { signals: signals({ format: "text", pageCount: null, multiColumn: null }) } }));
    expect(finding(r, "columns").status).toBe("na");
    expect(finding(r, "pages").status).toBe("na");
    expect(r.score).toBe(100);
  });
});
