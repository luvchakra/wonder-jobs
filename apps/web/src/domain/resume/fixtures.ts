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

const u = (text: string, i: number): CareerBullet => ({ id: `q${i}`, text, provenance: "USER_PROVIDED" });

/** A realistic mid-career engineer: every common section at typical lengths — about one full page. */
export const REALISTIC_FIXTURE: CareerDNA = {
  ...base,
  name: "Priya Raghunathan",
  headline: "Senior Software Engineer · Distributed Systems",
  yearsExperience: 9,
  seniority: "senior",
  skills: ["Go", "Java", "Python", "Kubernetes", "AWS", "Terraform", "Kafka", "PostgreSQL", "gRPC", "System Design", "Observability", "Mentoring"].map((name, i) => ({ name, level: (5 - (i % 3)) as 3 | 4 | 5 })),
  strengths: ["Designs systems that stay simple under load", "Raises the bar through reviews and mentoring"],
  history: {
    contact: { email: "priya.r@example.com", phone: "+91 98450 12345", location: "Bengaluru, India", linkedinUrl: "https://www.linkedin.com/in/example-priya", websiteUrl: "https://priya.example.dev" },
    summary: "Senior engineer with nine years building payment and messaging platforms. Designs services that handle millions of requests a day, cuts cloud spend without cutting reliability, and mentors engineers into owners.",
    experience: [
      { id: "e1", employer: "Example Payments Pvt. Ltd.", title: "Senior Software Engineer, Platform", location: "Bengaluru, India", startDate: "2021-06", current: true, bullets: [u("Led the redesign of the ledger service in Go, cutting p99 latency from 480 ms to 120 ms at 15k requests per second", 1), u("Moved 40+ services to Kubernetes with Terraform modules the whole org now uses", 2), u("Introduced SLOs and error budgets; paged incidents fell by half over two quarters", 3), u("Mentored six engineers; three now lead their own services", 4)], provenance: "USER_PROVIDED" },
      { id: "e2", employer: "Sample Messaging Co.", title: "Software Engineer II", location: "Hyderabad, India", startDate: "2018-02", endDate: "2021-05", summary: "Core team for the notification platform (SMS, email and push).", bullets: [u("Built the Kafka-based delivery pipeline sending 30M messages a day with exactly-once semantics per recipient", 5), u("Wrote the retry and back-pressure design adopted by three other teams", 6), u("Cut AWS cost by 28% by right-sizing clusters and moving cold data to S3", 7)], provenance: "USER_PROVIDED" },
      { id: "e3", employer: "Demo Software Labs", title: "Software Engineer", location: "Chennai, India", startDate: "2015-07", endDate: "2018-01", bullets: [u("Developed REST APIs in Java/Spring for the merchant dashboard", 8), u("Added integration tests that caught regressions before release; release rollbacks dropped to zero", 9)], provenance: "USER_PROVIDED" },
    ],
    education: [{ id: "ed1", institution: "Example National Institute of Technology", degree: "B.E.", field: "Computer Science and Engineering", location: "Tiruchirappalli, India", startDate: "2011", endDate: "2015", honors: ["Gold medal", "Dean's list 2013–2015"], provenance: "USER_PROVIDED" }],
    certifications: [
      { id: "c1", name: "AWS Certified Solutions Architect – Professional", issuer: "Amazon Web Services", issueDate: "2022-09", expiryDate: "2025-09", credentialId: "AWS-PSA-12345", url: "https://verify.example.com/aws", provenance: "USER_PROVIDED" },
      { id: "c2", name: "Certified Kubernetes Administrator (CKA)", issuer: "The Linux Foundation", issueDate: "2020-11", provenance: "USER_PROVIDED" },
    ],
    projects: [
      { id: "p1", name: "tracekit", description: "Open-source Go library for adding OpenTelemetry tracing to gRPC services in two lines.", technologies: ["Go", "OpenTelemetry", "gRPC"], url: "https://github.com/example/tracekit", bullets: [u("1.2k GitHub stars; used in production by several companies", 10)], provenance: "USER_PROVIDED" },
    ],
    publications: [],
    researchInterests: [],
  },
};

/**
 * What people actually type or paste: their own bullet markers, smart quotes, long URLs and e-mail
 * addresses, odd dashes, an emoji. Kept out of FIXTURES because the emoji is meant to be reported.
 */
export const PASTED_FIXTURE: CareerDNA = {
  ...base,
  name: "Dana O’Connor-Smith",
  headline: "Marketing Lead — Growth & Brand",
  history: {
    contact: { email: "dana.oconnor.smith.marketing@example-long-domain-name.com", phone: "(022) 4000-1234", location: "Pune, Maharashtra, India", linkedinUrl: "https://www.linkedin.com/in/dana-oconnor-smith-growth-marketing-lead-1234567890/", portfolioUrl: "https://portfolio.example.com/dana/work/case-studies" },
    summary: "“Growth marketer” with 8+ years — B2C & B2B — who’s run $2M/yr budgets, 40% YoY growth, and teams of 5–12. Loves data 📈 and good copy.",
    experience: [
      { id: "x1", employer: "Example Brands", title: "Marketing Lead", location: "Pune", startDate: "2020-03", current: true, bullets: [u("• Grew organic sign-ups 3× in 18 months (from 12k to 36k/month)", 1), u("- Ran paid campaigns across Google, Meta & LinkedIn with a ₹1.5 Cr annual budget", 2), u("Launched the referral program: https://www.example.com/referral-program-launch-announcement-2021-q3-details", 3), u("Built a 5-person team; hired a content lead, a designer & 3 performance marketers", 4)], provenance: "USER_PROVIDED" },
      { id: "x2", employer: "Sample Agency", title: "Senior Associate", startDate: "2016-06", endDate: "2020-02", bullets: [u("Managed 10+ client accounts; retention 95%", 5)], provenance: "USER_PROVIDED" },
    ],
    education: [{ id: "y1", institution: "Example University", degree: "MBA", field: "Marketing", endDate: "2016", provenance: "USER_PROVIDED" }],
    certifications: [],
    projects: [],
    publications: [],
    researchInterests: [],
  },
};
