/**
 * Privacy facts shared by the privacy notice (/privacy), the in-app "Your data" card and the server
 * (consent records, retention purge). One source, so what the notice says is what the code does.
 */

/** Bump when the privacy notice changes materially; signed-in candidates are asked to review it again. */
export const PRIVACY_NOTICE_VERSION = "2026-10-03.2";

/** The candidate types this exact phrase to delete their account; a stray click or a forged request can't. */
export const ERASE_PHRASE = "DELETE MY ACCOUNT";

/** Minimum age to use WonderJobs (DPDP Act s.9 treats under-18s as children needing verifiable parental consent). */
export const MINIMUM_AGE = 18;

export interface RetentionRule {
  data: string;
  period: string;
  /** Days, when enforced automatically by the daily job. */
  days?: number;
  basis: string;
}

export const RETENTION: RetentionRule[] = [
  { data: "Account, Career Profile, jobs, applications, run history, settings", period: "Until you delete your account", basis: "Contract — providing the service you asked for" },
  { data: "Résumé files you upload (PDF or Word, encrypted)", period: "Until you delete the file or your account", basis: "Contract — attaching your own résumé when you apply" },
  { data: "Encrypted AI provider keys", period: "Until you remove the key or delete your account", basis: "Contract" },
  { data: "Action audit (what Wonder did on your behalf, and when)", period: "Until you delete your account; rows can't be edited", basis: "Legitimate interest — accountability and security" },
  { data: "Contact-form messages", period: "24 months, then deleted automatically", days: 730, basis: "Legitimate interest — answering you" },
  { data: "Notice acknowledgements and consents", period: "Until you delete your account", basis: "Legal obligation — proof of notice and consent" },
  { data: "Billing ledger (payment events: amounts, currency, dates, provider reference ids and your account id — no card or bank details, no profile data)", period: "At least 8 years (the legal minimum), including after account deletion; it isn't deleted automatically after that yet", basis: "Legal obligation — tax and accounting records (Companies Act 2013 s.128, CGST Act s.36)" },
  { data: "Record that an export or erasure was requested (a one-way hash, not your id)", period: "At least 8 years; not yet deleted automatically", basis: "Legal obligation — demonstrating compliance" },
];

export const CONTACT_MESSAGE_RETENTION_DAYS = RETENTION.find((r) => r.days)!.days!;

/** Who the candidate can complain to. From the environment; never invented. */
export function grievanceContact(env: Record<string, string | undefined> = { name: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME, email: process.env.NEXT_PUBLIC_PRIVACY_EMAIL }): { name?: string; email?: string } {
  return { name: env.name?.trim() || undefined, email: env.email?.trim() || undefined };
}

/** Everyone who processes personal data for WonderJobs, and what for. Shown on /privacy. */
export const SUB_PROCESSORS: { name: string; purpose: string; data: string }[] = [
  { name: "Supabase", purpose: "Authentication and database", data: "Account, everything you store in the app, including résumé files you upload (encrypted before they reach it)" },
  { name: "Vercel", purpose: "Hosting (Mumbai region, bom1)", data: "Requests in transit, short-lived server logs" },
  { name: "Anthropic, OpenAI or Google", purpose: "AI drafting — only the provider you chose, or the one behind WonderJobs AI", data: "The Career Profile details and job posting a draft needs, only when you run that feature; the text of a résumé, only when you ask it to read one" },
  { name: "Razorpay", purpose: "Payments in India (when you subscribe)", data: "Payment details you enter on Razorpay's page; your account id as a reference" },
  { name: "Stripe", purpose: "International payments (when you subscribe)", data: "Payment details you enter on Stripe's page; your email and account id as a reference" },
  { name: "Resend", purpose: "Forwarding contact-form messages to our team", data: "Name, email and message you send us" },
  { name: "Your browser's push service (Google, Apple, Mozilla)", purpose: "Delivering notifications you turned on", data: "An encrypted notification; no profile data" },
  { name: "Job sources (Greenhouse, Lever, Ashby, Adzuna and others)", purpose: "Finding postings", data: "Search terms only — never your identity" },
];
