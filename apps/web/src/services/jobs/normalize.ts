/**
 * Turns a posting from any source into the product's `Job` shape. Everything
 * derived here (skills, seniority, industry, work mode, salary) comes from the
 * posting's own text with deterministic rules, so it is explainable and never
 * invented. Runs on the server (fetchers) and is pure, so it is unit-tested.
 */
import type { Job, WorkMode } from "@/domain/jobs/types";
import { hashKey } from "@/lib/ids";

export interface RawPosting {
  externalId: string;
  title: string;
  company: string;
  companyDomain?: string;
  /** Free-text location as the source shows it (city, region, "Worldwide", ...). */
  location: string;
  remote?: boolean;
  /** HTML or plain text. */
  description: string;
  tags?: string[];
  postedAt?: string | number | null;
  applyUrl: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryText?: string | null;
  seniorityHint?: string | null;
  industryHint?: string | null;
  /** True when the posting lives on the employer's own careers page / ATS. */
  employerSite: boolean;
  applyPath?: Job["applyPath"];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#8217": "’", "#8211": "–", "#8212": "—", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", bull: "•" };

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?x?[0-9a-z]+);/gi, (_, e: string) => {
      if (ENTITIES[e] !== undefined) return ENTITIES[e];
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (/^#\d+$/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 10));
      return " ";
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Skills Wonder recognises in postings. Multi-word phrases are matched before single words. */
export const SKILL_LEXICON: string[] = [
  // product & strategy
  "Product Strategy", "Product Management", "Roadmapping", "Roadmap", "Product Discovery", "User Research", "Customer Research", "A/B Testing", "Experimentation", "Analytics", "Product Analytics", "Metrics", "KPIs", "OKRs", "PRDs", "Prioritization", "Stakeholder Management", "Go-to-Market", "GTM", "Growth", "Retention", "Monetization", "Pricing", "Onboarding", "Agile", "Scrum", "Kanban", "Jira", "Figma", "Wireframing", "Prototyping", "UX", "UI Design", "Design Systems", "User Interviews", "Usability Testing", "Customer Journey", "Market Research", "Competitive Analysis", "Business Case", "P&L", "Platform", "APIs", "Payments", "Lending", "Risk", "Compliance", "Fraud", "Marketplace", "B2B", "B2C", "SaaS", "Mobile", "iOS", "Android",
  // data
  "SQL", "Python", "R", "Excel", "Tableau", "Looker", "Power BI", "Mixpanel", "Amplitude", "Google Analytics", "Data Analysis", "Data Science", "Machine Learning", "Deep Learning", "NLP", "LLMs", "Generative AI", "AI", "Statistics", "Forecasting", "Data Modeling", "dbt", "Snowflake", "BigQuery", "Spark", "Airflow", "ETL", "Data Engineering", "Pandas", "TensorFlow", "PyTorch", "Scikit-learn",
  // engineering
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Vue", "Angular", "Java", "Kotlin", "Swift", "Go", "Rust", "C++", "C#", ".NET", "Ruby", "Rails", "PHP", "Laravel", "Django", "Flask", "FastAPI", "Spring", "GraphQL", "REST", "gRPC", "Microservices", "Distributed Systems", "System Design", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "RabbitMQ", "Elasticsearch", "AWS", "GCP", "Azure", "Kubernetes", "Docker", "Terraform", "CI/CD", "DevOps", "SRE", "Observability", "Security", "Testing", "Automation", "Selenium", "Playwright", "Cypress", "React Native", "Flutter", "WebSockets", "HTML", "CSS", "Tailwind",
  // business & ops
  "Sales", "Account Management", "Customer Success", "Business Development", "Partnerships", "Operations", "Supply Chain", "Logistics", "Finance", "Accounting", "FP&A", "Recruiting", "HR", "People Operations", "Content", "SEO", "SEM", "Copywriting", "Brand", "Social Media", "Email Marketing", "Performance Marketing", "Marketing", "CRM", "Salesforce", "HubSpot", "Project Management", "Program Management", "Communication", "Leadership", "Mentoring", "Negotiation", "Presentation", "Strategy", "Consulting",
];

const lexiconRegex = new Map(SKILL_LEXICON.map((s) => [s, new RegExp(`(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![a-z0-9+#])`, "i")]));

export function extractSkills(text: string, max = 12): string[] {
  const found: string[] = [];
  for (const skill of SKILL_LEXICON) {
    if (lexiconRegex.get(skill)!.test(text)) {
      if (!found.some((f) => f.toLowerCase() === skill.toLowerCase())) found.push(skill);
      if (found.length >= max) break;
    }
  }
  return found;
}

export function inferSeniority(title: string, hint?: string | null): Job["seniority"] {
  const t = `${title} ${hint ?? ""}`.toLowerCase();
  if (/\b(intern|internship|trainee|graduate|entry[- ]level|junior|jr\.?|associate)\b/.test(t)) return "junior";
  if (/\b(director|vp|vice president|head of|chief|cxo|cpo|cto|ceo|coo)\b/.test(t)) return "director";
  if (/\b(lead|principal|staff|group product manager|gpm|manager of|engineering manager|architect)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|experienced|specialist ii|iii)\b/.test(t)) return "senior";
  if (/\bmid[- ]?level\b/.test(t)) return "mid";
  return "mid";
}

const INDUSTRY_RULES: [string, RegExp][] = [
  ["Fintech", /\b(fintech|payments?|banking|lending|neobank|wallet|insur(ance|tech)|trading|brokerage|wealth|crypto|blockchain|web3|defi|remittance|upi)\b/i],
  ["E-commerce", /\b(e-?commerce|marketplace|retail|d2c|quick commerce|grocery|shopping|storefront)\b/i],
  ["Healthcare", /\b(health(care|tech)?|medical|clinical|pharma|biotech|telehealth|hospital|wellness)\b/i],
  ["Education", /\b(ed-?tech|education|learning platform|students?|university|courses?|tutoring|upskilling)\b/i],
  ["Gaming", /\b(gaming|games?|esports|fantasy sports)\b/i],
  ["Media", /\b(media|streaming|entertainment|publishing|news|creator economy|music|video)\b/i],
  ["Mobility", /\b(mobility|ride-?hailing|logistics|delivery|transport|automotive|ev\b|fleet)\b/i],
  ["Travel", /\b(travel|hospitality|hotels?|airline|booking)\b/i],
  ["Telecom", /\b(telecom|telco|5g|networking|carrier)\b/i],
  ["Consumer", /\b(consumer|social|community|dating|lifestyle|food|restaurant)\b/i],
  ["Technology", /\b(saas|software|developer tools?|infrastructure|cloud|platform|api|ai|machine learning|data|security|cybersecurity|devops|analytics|enterprise)\b/i],
];

export function inferIndustry(text: string, hint?: string | null): string {
  const hay = `${hint ?? ""} ${text}`;
  for (const [name, re] of INDUSTRY_RULES) if (re.test(hay)) return name;
  return "Technology";
}

const INDIA_PLACES = /\b(india|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|delhi|new delhi|gurugram|gurgaon|noida|kolkata|ahmedabad|jaipur|kochi|indore|chandigarh)\b/i;
const WORLDWIDE = /\b(worldwide|anywhere|global|remote[- ]first|apac|asia|india|asia[- ]pacific|utc\+5)/i;

export function inferCountry(location: string): string {
  const l = location.toLowerCase();
  if (INDIA_PLACES.test(l)) return "IN";
  if (/\b(united states|usa|u\.s\.|us only|new york|san francisco|california|texas|seattle|boston|austin|chicago|denver|remote - us|us remote)\b/.test(l)) return "US";
  if (/\b(united kingdom|uk|london|england)\b/.test(l)) return "GB";
  if (/\b(germany|berlin|munich|münchen|hamburg|frankfurt)\b/.test(l)) return "DE";
  if (/\b(canada|toronto|vancouver)\b/.test(l)) return "CA";
  if (/\b(singapore)\b/.test(l)) return "SG";
  if (/\b(australia|sydney|melbourne)\b/.test(l)) return "AU";
  if (/\b(europe|eu\b|netherlands|amsterdam|france|paris|spain|portugal|poland|ireland|dublin)\b/.test(l)) return "EU";
  if (WORLDWIDE.test(l)) return "";
  return "";
}

export function inferWorkMode(location: string, remoteFlag?: boolean, workplaceHint?: string | null): WorkMode {
  const l = `${location} ${workplaceHint ?? ""}`.toLowerCase();
  if (/\bhybrid\b/.test(l)) return "hybrid";
  if (remoteFlag || /\b(remote|anywhere|worldwide|work from home|wfh|distributed)\b/.test(l)) return "remote";
  if (/\bon-?site\b/.test(l)) return "onsite";
  return "onsite";
}

/** "$90k - $120k", "₹25L–40L", "$90 - $150 /hour", "60,000 - 80,000 EUR" → annual min/max + currency. */
export function parseSalary(text: string | null | undefined): { min?: number; max?: number; currency?: string } {
  if (!text) return {};
  const t = text.replace(/,/g, "");
  const currency = /₹|inr|rs\.?/i.test(t) ? "INR" : /€|eur\b/i.test(t) ? "EUR" : /£|gbp\b/i.test(t) ? "GBP" : /\$|usd\b/i.test(t) ? "USD" : undefined;
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs|cr|crore)?/gi)].map((m) => {
    const n = parseFloat(m[1]);
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "k") return n * 1000;
    if (unit === "l" || unit.startsWith("lakh")) return n * 100_000;
    if (unit === "cr" || unit.startsWith("crore")) return n * 10_000_000;
    return n;
  });
  if (!nums.length) return { currency };
  let [min, max] = nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
  if (/\/\s*h(ou)?r|per hour|hourly/i.test(t)) [min, max] = [min * 2000, max * 2000];
  else if (/\/\s*month|per month|monthly|p\.?m\.?\b/i.test(t)) [min, max] = [min * 12, max * 12];
  else if (/\/\s*day|per day|daily/i.test(t)) [min, max] = [min * 220, max * 220];
  if (max < min) [min, max] = [max, min];
  if (max < 1000) return { currency }; // not an annual figure we can trust
  return { min: Math.round(min), max: Math.round(max), currency };
}

/** Requirement-like lines: bullets under "requirements / what you bring / qualifications" or lines that read like them. */
export function extractRequirements(text: string): { requirements: string[]; niceToHave: string[] } {
  const lines = text.split("\n").map((l) => l.replace(/^[-•*·]\s*/, "").trim()).filter(Boolean);
  const requirements: string[] = [];
  const niceToHave: string[] = [];
  let section: "req" | "nice" | null = null;
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/^(requirements?|qualifications?|what you('ll)? bring|what we('re| are) looking for|who you are|you have|must[- ]haves?|about you|skills? (and|&) experience)\b/.test(l) && line.length < 60) {
      section = "req";
      continue;
    }
    if (/^(nice[- ]to[- ]haves?|bonus|preferred|good to have|plus(es)?)\b/.test(l) && line.length < 40) {
      section = "nice";
      continue;
    }
    if (/^(responsibilities|what you('ll)? do|about (us|the role|the team)|benefits|perks|compensation|how to apply)\b/.test(l) && line.length < 60) {
      section = null;
      continue;
    }
    if (section === "req" && requirements.length < 8 && line.length > 15 && line.length < 220) requirements.push(line);
    else if (section === "nice" && niceToHave.length < 5 && line.length > 15 && line.length < 220) niceToHave.push(line);
  }
  if (!requirements.length) {
    for (const line of lines) {
      if (/\b(\d+\+?\s*(years|yrs)|experience (in|with)|proficien|strong (understanding|background)|ability to|track record)\b/i.test(line) && line.length > 20 && line.length < 220) requirements.push(line);
      if (requirements.length >= 6) break;
    }
  }
  return { requirements, niceToHave };
}

export function toIso(value: string | number | null | undefined, fallback = Date.now()): string {
  if (value == null || value === "") return new Date(fallback).toISOString();
  const n = typeof value === "number" ? value : /^\d{9,13}$/.test(String(value)) ? Number(value) : NaN;
  const ms = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(value));
  return new Date(Number.isFinite(ms) ? ms : fallback).toISOString();
}

export function normalizePosting(sourceId: string, raw: RawPosting, now = Date.now()): Job {
  const description = htmlToText(raw.description).slice(0, 6000);
  const title = raw.title.trim().replace(/\s+/g, " ");
  const location = raw.location.trim().replace(/\s+/g, " ") || (raw.remote ? "Remote" : "Not specified");
  const workMode = inferWorkMode(location, raw.remote);
  const hay = `${title}\n${(raw.tags ?? []).join(" ")}\n${description}`;
  const parsed = raw.salaryMin != null || raw.salaryMax != null ? { min: raw.salaryMin ?? undefined, max: raw.salaryMax ?? undefined, currency: raw.currency ?? undefined } : parseSalary(raw.salaryText);
  const hasSalary = (parsed.min ?? 0) > 0 || (parsed.max ?? 0) > 0;
  const { requirements, niceToHave } = extractRequirements(description);
  const skills = extractSkills(hay);
  const country = inferCountry(location);
  return {
    id: `${sourceId}_${hashKey(`${sourceId}:${raw.externalId}`)}`,
    sourceId,
    externalId: String(raw.externalId),
    title,
    company: raw.company.trim() || "Unknown company",
    companyDomain: raw.companyDomain,
    location,
    country,
    workMode,
    salaryMin: hasSalary ? parsed.min || parsed.max : undefined,
    salaryMax: hasSalary ? parsed.max || parsed.min : undefined,
    currency: hasSalary ? (parsed.currency ?? (country === "IN" ? "INR" : "USD")) : country === "IN" ? "INR" : "USD",
    postedAt: toIso(raw.postedAt, now),
    observedAt: new Date(now).toISOString(),
    description,
    requirements,
    niceToHave,
    skills,
    seniority: inferSeniority(title, raw.seniorityHint),
    industry: inferIndustry(hay, raw.industryHint),
    applyUrl: raw.applyUrl,
    applyPath: raw.applyPath ?? (raw.employerSite ? "employer_site" : "platform"),
    onEmployerSite: raw.employerSite,
    repostCount: 0,
    tags: (raw.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8),
  };
}

const STOP = new Set(["a", "an", "the", "and", "or", "for", "of", "in", "at", "to", "with", "on", "as", "is", "be", "are", "find", "finding", "looking", "roles", "role", "jobs", "job", "position", "positions", "companies", "company", "opportunity", "opportunities", "work", "working", "remote", "hybrid", "onsite", "tech", "based", "near", "me", "my", "i", "want", "would", "like", "new", "next", "good", "great", "top"]);

/** Search terms from a plain-language goal: "Senior product roles at fintech companies" → ["senior", "product", "fintech"]. */
export function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9+#./ -]/g, " ").split(/[\s,/]+/).filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 8);
}

const SENIORITY_WORDS = new Set(["senior", "junior", "lead", "principal", "staff", "director", "head", "vp", "intern", "entry", "mid"]);
const INDUSTRY_WORDS = new Set(["fintech", "ecommerce", "e-commerce", "healthcare", "healthtech", "edtech", "education", "gaming", "media", "mobility", "travel", "telecom", "consumer", "saas", "b2b", "b2c", "startup", "startups", "enterprise", "crypto", "web3", "insurtech"]);

/** The core phrase to send to a source's own search box (drops seniority and industry qualifiers). */
export function corePhrase(query: string): string {
  const terms = queryTerms(query).filter((t) => !SENIORITY_WORDS.has(t) && !INDUSTRY_WORDS.has(t));
  return (terms.length ? terms : queryTerms(query)).slice(0, 3).join(" ");
}

/** Does a posting match the search? Any core term in the title, or most terms somewhere in the text. */
/** Title carries the whole core phrase ("product manager"), not just any one word of it ("manager"). */
export function titleMatches(title: string, query: string): boolean {
  const core = queryTerms(corePhrase(query));
  if (!core.length) return true;
  const t = title.toLowerCase();
  return core.every((c) => t.includes(c));
}

export function matchesQuery(job: Pick<Job, "title" | "description" | "tags" | "skills">, query: string): boolean {
  const terms = queryTerms(query);
  if (!terms.length) return true;
  if (titleMatches(job.title, query)) return true;
  // Otherwise the posting must carry most of the search terms in its title, tags or skills (not just the body).
  const head = `${job.title} ${job.tags.join(" ")} ${job.skills.join(" ")}`.toLowerCase();
  const core = queryTerms(corePhrase(query));
  const coreHits = core.filter((t) => head.includes(t)).length;
  const hits = terms.filter((t) => head.includes(t)).length;
  return coreHits >= Math.max(1, core.length - 1) && hits >= Math.min(terms.length, Math.max(2, Math.ceil(terms.length * 0.5)));
}

/** Remotive's category slug for a search, when the core phrase clearly belongs to one. */
export function remotiveCategory(query: string): string | null {
  const t = corePhrase(query);
  const rules: [RegExp, string][] = [
    [/\b(product)\b/, "product"],
    [/\b(engineer|developer|software|backend|frontend|full[- ]?stack|programmer)\b/, "software-dev"],
    [/\b(data|analyst|scientist|analytics)\b/, "data"],
    [/\b(design|designer|ux|ui)\b/, "design"],
    [/\b(marketing|growth|seo|content)\b/, "marketing"],
    [/\b(sales|business|account)\b/, "sales-business"],
    [/\b(devops|sre|sysadmin|infrastructure)\b/, "devops"],
    [/\b(finance|legal|accountant)\b/, "finance-legal"],
    [/\b(hr|recruit|people)\b/, "hr"],
    [/\b(support|success)\b/, "customer-support"],
    [/\b(qa|quality|test)\b/, "qa"],
    [/\b(writer|writing|editor)\b/, "writing"],
  ];
  for (const [re, slug] of rules) if (re.test(t)) return slug;
  return null;
}

/** Location fit for a search: remote roles always pass; otherwise the posting must mention one of the places. */
export function matchesLocations(job: Pick<Job, "location" | "workMode" | "country">, locations: string[]): boolean {
  if (!locations.length) return true;
  const wantsRemote = locations.some((l) => /remote|anywhere/i.test(l));
  if (job.workMode === "remote" && (wantsRemote || locations.length === 0)) return true;
  if (job.workMode === "remote") return true; // remote roles are reachable from anywhere; scoring downgrades restricted regions
  const jl = job.location.toLowerCase();
  const wantsIndia = locations.some((l) => INDIA_PLACES.test(l));
  return locations.some((l) => {
    const term = l.toLowerCase().replace(/,?\s*india$/, "").trim();
    return term && term !== "remote" && jl.includes(term);
  }) || (wantsIndia && job.country === "IN");
}

/** Whether a remote posting is open to someone in the given places (Worldwide/APAC/India vs. "US only"). */
export function remoteOpenTo(job: Pick<Job, "location" | "workMode">, locations: string[]): boolean | null {
  if (job.workMode !== "remote") return null;
  const jl = job.location.toLowerCase();
  if (WORLDWIDE.test(jl) || jl === "remote" || jl === "remote (worldwide)") return true;
  return locations.some((l) => {
    const term = l.toLowerCase().replace(/,?\s*india$/, "").trim();
    return term && term !== "remote" && (jl.includes(term) || (INDIA_PLACES.test(term) && /india/.test(jl)));
  });
}
