/**
 * Company ratings: the employee-review rating a company has (overall and by category, out of 5), as a ratings
 * source reported it. Nothing here is computed or defaulted — a company without a rating has none.
 */

export interface CompanyRatings {
  /** Overall rating, 1–5. */
  overall: number;
  /** How many reviews it rests on. */
  reviews?: number;
  /** Category ratings, 1–5, as the source gave them. */
  categories?: Partial<Record<"workLife" | "culture" | "compensation" | "career" | "management" | "diversity", number>>;
  from: string;
}

const rating = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : undefined);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.round(v) : undefined);

/** One Explorium ratings row's `data` object as a rating; undefined when it carries no usable overall rating. */
export function parseExploriumRatings(data: unknown): CompanyRatings | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const overall = rating(d.ratings_overall);
  if (overall === undefined) return undefined;
  const cats = {
    workLife: rating(d.ratings_work_life_balance),
    // The API's own schema and its signal table spell this field two ways.
    culture: rating(d.ratings_culture_values ?? d.ratings_cutlure_values),
    compensation: rating(d.ratings_compensation_benefits),
    career: rating(d.ratings_career_opportunities),
    management: rating(d.ratings_senior_management),
    diversity: rating(d.ratings_diversity_inclusion),
  };
  const categories = Object.fromEntries(Object.entries(cats).filter(([, v]) => v !== undefined)) as CompanyRatings["categories"];
  const reviews = count(d.total_reviews_count) ?? count(d.ratings_all_reviews_count);
  return { overall, ...(reviews ? { reviews } : {}), ...(categories && Object.keys(categories).length ? { categories } : {}), from: "Explorium" };
}

/** "Oct 2026" — when a rating was looked up. */
export const ratingMonth = (iso: string | undefined, locale = "en-US") => (iso ? new Date(iso).toLocaleDateString(locale, { month: "short", year: "numeric" }) : "");
