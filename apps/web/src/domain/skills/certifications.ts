import type { GapJob } from "./gap";

/**
 * Certifications that the candidate's well-matched postings name, found in the postings' own words. Only
 * what a posting actually says is reported — a vocabulary of well-known credentials plus the
 * "<vendor> Certified <role>" pattern — and each comes with how many postings ask for it.
 */
export interface CertJob extends GapJob {
  /** The posting's title, requirements and description, as one text. */
  text: string;
}

export interface CertMention {
  name: string;
  jobs: number;
  /** How many of those are Strong matches. */
  strong: number;
  examples: GapJob[];
}

/** Credentials known by their short name; matched as a whole word, case-sensitively ("PMP", never "pmp"). */
const KNOWN: { re: RegExp; name: string }[] = [
  { re: /\bCISSP\b/, name: "CISSP (Certified Information Systems Security Professional)" },
  { re: /\bCISM\b/, name: "CISM (Certified Information Security Manager)" },
  { re: /\bCISA\b/, name: "CISA (Certified Information Systems Auditor)" },
  { re: /\bCRISC\b/, name: "CRISC (Certified in Risk and Information Systems Control)" },
  { re: /\bCCSP\b/, name: "CCSP (Certified Cloud Security Professional)" },
  { re: /\bCEH\b/, name: "CEH (Certified Ethical Hacker)" },
  { re: /\bOSCP\b/, name: "OSCP (Offensive Security Certified Professional)" },
  { re: /\bSecurity\+/, name: "CompTIA Security+" },
  { re: /\bPMP\b/, name: "PMP (Project Management Professional)" },
  { re: /\bPRINCE2\b/, name: "PRINCE2" },
  { re: /\bCAPM\b/, name: "CAPM (Certified Associate in Project Management)" },
  { re: /\bPMI-ACP\b/, name: "PMI-ACP (Agile Certified Practitioner)" },
  { re: /\bCertified Scrum ?Master\b/i, name: "Certified ScrumMaster" },
  { re: /\bSAFe\b/, name: "SAFe (Scaled Agile Framework)" },
  { re: /\bITIL\b/, name: "ITIL" },
  { re: /\bTOGAF\b/, name: "TOGAF" },
  { re: /\bCOBIT\b/, name: "COBIT" },
  { re: /\bCCNA\b/, name: "Cisco CCNA" },
  { re: /\bCCNP\b/, name: "Cisco CCNP" },
  { re: /\bCKAD?\b/, name: "Certified Kubernetes (CKA / CKAD)" },
  { re: /\bCFA\b/, name: "CFA (Chartered Financial Analyst)" },
  { re: /\bFRM\b/, name: "FRM (Financial Risk Manager)" },
  { re: /\bSHRM-(?:CP|SCP)\b/, name: "SHRM-CP / SHRM-SCP" },
  { re: /\bSix Sigma (?:Green|Black) Belt\b/i, name: "Six Sigma Green / Black Belt" },
];

/** "<Vendor> Certified: <Title Case Role>" — the vendor and the role, up to a few words. */
const VENDOR = /\b(AWS|Microsoft|Google Cloud|Salesforce|Oracle|Cisco|Red Hat|SAP|ServiceNow|Okta|SailPoint|CyberArk|HashiCorp|Databricks|Snowflake)\s+Certified:?\s+([A-Z][\w&+/.-]*(?:\s+(?:[A-Z][\w&+/.-]*|and|for|of|in|-|–)){0,5})/g;

const clean = (s: string) => s.replace(/\s+(?:and|for|of|in|-|–)$/i, "").trim();
const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Names found in one posting, each once. */
export function certificationsIn(text: string): string[] {
  const names = new Map<string, string>();
  for (const k of KNOWN) if (k.re.test(text)) names.set(lower(k.name), k.name);
  for (const m of text.matchAll(VENDOR)) {
    const name = `${m[1]} Certified: ${clean(m[2])}`;
    if (!names.has(lower(name))) names.set(lower(name), name);
  }
  return [...names.values()];
}

export function certificationsAsked(jobs: CertJob[], have: string[] = [], max = 6, hidden: string[] = []): CertMention[] {
  const mine = have.map(lower).filter(Boolean);
  const unwanted = new Set(hidden.map(lower));
  const found = new Map<string, CertMention>();
  for (const job of jobs) {
    for (const name of certificationsIn(`${job.title}\n${job.text}`)) {
      const key = lower(name);
      // Already on the candidate's profile: not something to skill up for.
      if (unwanted.has(key) || mine.some((h) => h === key || key.includes(h) || h.includes(key.split(" (")[0]))) continue;
      const entry = found.get(key) ?? { name, jobs: 0, strong: 0, examples: [] };
      entry.jobs++;
      if (job.strong) entry.strong++;
      if (entry.examples.length < 3) entry.examples.push({ id: job.id, title: job.title, company: job.company, skills: job.skills });
      found.set(key, entry);
    }
  }
  return [...found.values()].sort((a, b) => b.jobs - a.jobs || a.name.localeCompare(b.name)).slice(0, max);
}
