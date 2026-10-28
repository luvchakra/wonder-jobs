/**
 * An internship's own terms (WJ-413, WonderStar's Internships module): how long it runs and when it starts. The stipend
 * is the job's pay, kept per year like every salary on WonderJobs and shown per month for an internship. Pure, so the
 * hiring form, the server and the "WonderJobs employers" source share it.
 */
export interface InternshipTerms {
  /** 1–24 months. */
  durationMonths?: number;
  /** YYYY-MM-DD. */
  startsOn?: string;
}

export const DURATIONS = [1, 2, 3, 4, 6, 9, 12] as const;

/** Only for an internship; anything malformed is dropped, never guessed. */
export function cleanInternship(raw: unknown, jobType: string | undefined): InternshipTerms | undefined {
  if (jobType !== "internship" || !raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const months = typeof r.durationMonths === "number" && Number.isInteger(r.durationMonths) && r.durationMonths >= 1 && r.durationMonths <= 24 ? r.durationMonths : undefined;
  const starts = typeof r.startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startsOn) && !Number.isNaN(Date.parse(r.startsOn)) ? r.startsOn : undefined;
  const out: InternshipTerms = { ...(months ? { durationMonths: months } : {}), ...(starts ? { startsOn: starts } : {}) };
  return Object.keys(out).length ? out : undefined;
}

const money = (v: number, currency: string) => {
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${sym}${Math.round(v).toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`;
};

/** "₹15,000–₹20,000 a month" from a yearly range; null when no pay is stated. */
export function monthlyStipend(min: number | undefined | null, max: number | undefined | null, currency: string): string | null {
  if (min == null && max == null) return null;
  const lo = min != null ? money(min / 12, currency) : null;
  const hi = max != null ? money(max / 12, currency) : null;
  return `${lo && hi && lo !== hi ? `${lo}–${hi}` : (lo ?? hi)} a month`;
}

/** The line an internship posting opens with: "Internship · 6 months · starts 5 Jan 2027 · stipend ₹15,000 a month". */
export function internshipLine(terms: InternshipTerms | undefined, pay: { salaryMin?: number | null; salaryMax?: number | null; currency: string }): string {
  const stipend = monthlyStipend(pay.salaryMin, pay.salaryMax, pay.currency);
  const starts = terms?.startsOn ? new Date(`${terms.startsOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return ["Internship", terms?.durationMonths ? `${terms.durationMonths} ${terms.durationMonths === 1 ? "month" : "months"}` : null, starts ? `starts ${starts}` : null, stipend ? `stipend ${stipend}` : "stipend not stated"].filter(Boolean).join(" · ");
}
