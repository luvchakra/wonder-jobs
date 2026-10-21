/** A company's name and website, as an Owner types them. Shared by the form and the server. */
export interface CompanyFields {
  name: string;
  website?: string;
}

/** "wonderhome.com" → "https://wonderhome.com"; a full address stays as is; empty stays empty. */
export function normalizeWebsite(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || /^https?:\/\//i.test(v)) return v;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v) ? `https://${v}` : v;
}

/** What's wrong with the details, or null when they can be saved. */
export function companyProblem(c: CompanyFields): string | null {
  const name = c.name.trim();
  if (name.length < 2 || name.length > 120) return "Give the company a name (2 to 120 characters).";
  const website = normalizeWebsite(c.website);
  if (website && (!/^https?:\/\/\S+\.\S+/i.test(website) || website.length > 300)) return "Add the company's website, like wonderhome.com.";
  return null;
}

/** Personal email providers: an address there says nothing about which company someone works for. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "zoho.com", "zohomail.com", "yandex.com",
  "gmx.com", "gmx.net", "mail.com", "rediffmail.com", "tutanota.com", "fastmail.com", "hey.com", "duck.com",
]);

/** The website's host without "www.", or null when there's no usable website. */
export function websiteDomain(website: string | undefined | null): string | null {
  try {
    const host = new URL(normalizeWebsite(website ?? "")).hostname.toLowerCase();
    return host.includes(".") ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/**
 * Whether a signed-in email proves the person works at the company: its domain is the website's, or one is
 * a subdomain of the other (jobs.acme.com and acme.com), and it isn't a personal email provider.
 */
export function workEmailMatches(email: string | undefined | null, website: string | undefined | null): boolean {
  const site = websiteDomain(website);
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  if (!site || !domain || FREE_MAIL.has(domain) || FREE_MAIL.has(site)) return false;
  return domain === site || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`);
}
