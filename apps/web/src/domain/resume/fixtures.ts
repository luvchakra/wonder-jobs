/**
 * Synthetic résumé fixtures (spec §45–49, §79). Invented people with example.com addresses — never
 * real candidate data. Used by the template tests and the visual baselines; never shown to a user.
 */
import type { CareerDNA } from "@/domain/career/types";
import type { CareerBullet, CareerHistory } from "@/domain/career/history";

const b = (text: string, i: number): CareerBullet => ({ id: `fx_b${i}`, text, provenance: "USER_PROVIDED" });
const base: Omit<CareerDNA, "name" | "headline" | "history"> = {
  careerGoal: "Lead identity and access management programs",
  yearsExperience: 17,
  seniority: "director",
  skills: ["Identity Governance", "Access Management", "SailPoint", "Saviynt", "CyberArk", "Okta", "Azure", "AWS", "Zero Trust", "Program Leadership", "Stakeholder Management", "Python"].map((name, i) => ({ name, level: (i % 3) + 3 as 3 | 4 | 5 })),
  industries: ["Technology", "Fintech"],
  preferredLocations: ["Bengaluru", "Remote"],
  workModes: ["hybrid", "remote"],
  currency: "INR",
  strengths: ["Builds and leads identity security practices", "Turns audit findings into delivery roadmaps", "Coaches architects into people leaders"],
  growthAreas: [],
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const roles = (n: number, bullets: number, long = false) =>
  Array.from({ length: n }, (_, r) => ({
    id: `fx_exp${r}`,
    employer: long ? `Very Long Employer Name International Holdings & Strategic Consulting Services Private Limited (Asia Pacific)`.slice(0, 100) : ["Example Consulting", "Sample Bank Ltd.", "Placeholder Telecom", "Demo Systems", "Fictional Retail Group", "Illustrative Health", "Model Insurance", "Test Networks"][r % 8],
    title: long ? "Senior Director, Global Identity & Access Management and Zero Trust Security Programs" : ["Associate Director – Identity Practice Lead", "Principal Consultant, IAM", "Senior Security Architect", "Security Engineer", "Security Analyst", "Analyst", "Associate", "Trainee"][r % 8],
    location: long ? "Thiruvananthapuram, Kerala, India / Remote across APAC time zones" : ["Mumbai, India", "Singapore", "Bengaluru, India", "Pune, India"][r % 4],
    startDate: `${2023 - r * 2}-01`,
    endDate: r === 0 ? undefined : `${2024 - r * 2}-12`,
    current: r === 0,
    bullets: Array.from({ length: bullets }, (_, i) =>
      b(
        long
          ? `Led a multi-year identity transformation across business units, coordinating architecture, engineering, audit and regional stakeholders so that joiner/mover/leaver processes, privileged access reviews and certification campaigns ran on one governed platform (${i + 1})`
          : ["Led the identity practice across delivery, pre-sales and hiring", "Designed access governance for regulated clients", "Ran privileged access programs with audit and risk teams", "Built reusable onboarding patterns for SailPoint and Saviynt", "Mentored architects and consultants", "Presented roadmaps to CISOs and steering committees"][i % 6],
        r * 100 + i,
      ),
    ),
    provenance: "USER_PROVIDED" as const,
  }));

const fullHistory = (over: Partial<CareerHistory> = {}): CareerHistory => ({
  contact: { email: "candidate@example.com", phone: "+91 98765 43210", location: "Mumbai, India", linkedinUrl: "https://www.linkedin.com/in/example", portfolioUrl: "https://portfolio.example.com" },
  summary: "Identity and security leader with 17+ years across identity governance, privileged access and zero-trust programs for regulated enterprises. Builds practices, leads architects and turns audit findings into delivery roadmaps.",
  experience: roles(4, 7),
  education: [{ id: "fx_edu", institution: "Example Institute of Technology", degree: "B.Tech.", field: "Aerospace Engineering", location: "Kanpur, India", startDate: "2001", endDate: "2005", provenance: "USER_PROVIDED" }],
  certifications: [
    { id: "fx_c1", name: "Certified Information Systems Security Professional (CISSP)", issuer: "Example Certification Body", issueDate: "2019-05", provenance: "USER_PROVIDED" },
    { id: "fx_c2", name: "Cloud Security Specialty", issuer: "Example Cloud", issueDate: "2021-03", url: "https://verify.example.com/abc", provenance: "USER_PROVIDED" },
  ],
  projects: [{ id: "fx_p1", name: "Access Certification Accelerator", description: "Reusable campaign templates and reporting for quarterly access reviews.", technologies: ["SailPoint", "Python", "Power BI"], url: "https://github.com/example/accelerator", provenance: "USER_PROVIDED" }],
  publications: [{ id: "fx_pub1", title: "Designing Identity Governance for Hybrid Workforces", publication: "Example Security Journal", date: "2022-08", authors: ["A. Candidate", "B. Coauthor"], url: "https://journal.example.com/paper", provenance: "USER_PROVIDED" }],
  researchInterests: ["Identity Security", "Access Governance", "Cloud Security", "AI in Security"],
  ...over,
});

/** §45: long career, many roles and bullets, every section. */
export const ATS_FIXTURE: CareerDNA = { ...base, name: "Alexandra Venkataraman-Fitzgerald", headline: "Senior Director – Identity & Access Management and Zero Trust Security", history: fullHistory() };

/** §46: extreme lengths — 80-char title, 100-char employer, 15 bullets, 8 roles, long certifications. */
export const EXTREME_FIXTURE: CareerDNA = {
  ...base,
  name: "Maximiliana Theodora Rajalakshmi Bartholomew-Oyelaran",
  headline: "Senior Director, Global Identity & Access Management & Zero Trust Security / Risk & Compliance",
  skills: Array.from({ length: 40 }, (_, i) => ({ name: ["Identity Governance & Administration", "C/C++", "AWS / Azure / GCP", "Zero-Trust Network Access", "SIEM", "Terraform", "Kubernetes", "React"][i % 8] + (i >= 8 ? ` ${i}` : ""), level: 4 as const })),
  history: fullHistory({
    summary: "A deliberately long summary: identity and security leader with seventeen years across governance, privileged access, zero-trust architecture and audit remediation for regulated banks, insurers and telecom operators in India, Singapore and Europe — including slashes / ampersands & hyphens-and-dashes — and Unicode such as café, naïve, São Paulo, Zürich and ₹ amounts.",
    experience: [...roles(1, 15, true), ...roles(8, 3).slice(1)],
    certifications: [
      { id: "fx_c9", name: "Certified Identity Governance Expert — Advanced Practitioner Level for Hybrid Multi-Cloud Enterprise Environments", issuer: "Example Global Identity Standards Consortium & Partners", issueDate: "2020-02", credentialId: "EX-1234567890", provenance: "USER_PROVIDED" },
    ],
  }),
};

/** §47: only the essentials — no phone, links, summary, certifications, projects, publications or skills; one role. */
export const SPARSE_FIXTURE: CareerDNA = {
  ...base,
  name: "Sam Lee",
  headline: "",
  skills: [],
  strengths: [],
  history: { contact: { email: "sam.lee@example.com" }, experience: roles(1, 2), education: [], certifications: [], projects: [], publications: [], researchInterests: [] },
};

/** §48: accents and non-ASCII place names. */
export const INTERNATIONAL_FIXTURE: CareerDNA = {
  ...base,
  name: "José García Müller",
  headline: "Responsable Sécurité des Identités",
  history: fullHistory({
    contact: { email: "jose.garcia@example.com", location: "München, Deutschland" },
    experience: [
      { id: "fx_i1", employer: "Société Générale d’Exemple", title: "Architecte IAM", location: "Zürich, Schweiz", startDate: "2019-04", current: true, bullets: [b("Déploiement d’une gouvernance des accès — São Paulo, Bengaluru, München", 900), b("Coordination avec les équipes “Risque & Conformité”", 901)], provenance: "USER_PROVIDED" },
      { id: "fx_i2", employer: "Łódź Systems sp. z o.o.", title: "Inżynier bezpieczeństwa", location: "Kraków, Polska", startDate: "2015-01", endDate: "2019-03", bullets: [b("Wdrożenie systemu zarządzania tożsamością", 902)], provenance: "USER_PROVIDED" },
    ],
  }),
};

/** §49: every kind of link. */
export const LINK_FIXTURE: CareerDNA = {
  ...base,
  name: "Link Tester",
  headline: "Product Designer",
  history: fullHistory({
    contact: { email: "test@example.com", phone: "+91 98765 43210", linkedinUrl: "https://www.linkedin.com/in/example", portfolioUrl: "https://portfolio.example.com", websiteUrl: "https://www.example.org/about" },
    experience: roles(1, 2),
  }),
};

export const FIXTURES = { ats: ATS_FIXTURE, extreme: EXTREME_FIXTURE, sparse: SPARSE_FIXTURE, international: INTERNATIONAL_FIXTURE, links: LINK_FIXTURE };
