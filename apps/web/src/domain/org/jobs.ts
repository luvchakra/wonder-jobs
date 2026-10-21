/** What a job listing needs before it can be saved. Shared by the form (shown inline) and the server (enforced). */
export interface JobFields {
  title: string;
  location: string;
  description: string;
  applyUrl: string;
  salaryMin?: number;
  salaryMax?: number;
}

export const MIN_DESCRIPTION = 40;

/**
 * Where to apply, as people type it: a full address stays as is, a bare address ("acme.com/careers") gets
 * https://, and a plain email becomes mailto:. Anything else is returned trimmed and fails `jobProblem`.
 */
export function normalizeApplyUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^(https?:\/\/|mailto:)/i.test(v)) return v;
  if (/^[^@\s/]+@[^@\s]+\.[^@\s]+$/.test(v)) return `mailto:${v}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `https://${v}`;
  return v;
}

/** The first thing missing or wrong, in the form's order, or null when the job can be saved. */
export function jobProblem(i: JobFields): string | null {
  if (i.title.trim().length < 3) return "Give the job a title.";
  if (!i.location.trim()) return "Say where the job is (or Remote).";
  const d = i.description.trim().length;
  if (d < MIN_DESCRIPTION) return `Describe the job in a few sentences (${MIN_DESCRIPTION - d} more characters).`;
  const apply = normalizeApplyUrl(i.applyUrl);
  if (!/^https?:\/\/\S+\.\S+/i.test(apply) && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(apply)) return "Add where to apply: your careers page or an email address.";
  if (i.salaryMin != null && i.salaryMax != null && i.salaryMin > i.salaryMax) return "The lowest salary is above the highest.";
  return null;
}
