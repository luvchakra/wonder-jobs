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
