/**
 * The plain helpers every module's listing terms use: dates, money and work mode as one system shows them, and a
 * yearly pay range (how WorksLake keeps pay) read as a month's. Pure, for the server, the screens and the tests.
 */
import type { WorkMode } from "@/wonderworks/find/place";

export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real YYYY-MM-DD date. */
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** "3 Nov 2026". */
export const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
/** "₹15,000", "$40", "AED 900". */
export const money = (v: number, currency: string) => `${SYMBOL[currency] ?? `${currency} `}${v.toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`;

/** A yearly pay range as a month's; nothing for an end the posting doesn't state. */
export function monthlyFromYearly(min: number | undefined, max: number | undefined): { min?: number; max?: number } {
  const m = (v: number | undefined) => (typeof v === "number" && v > 0 ? Math.round(v / 12) : undefined);
  const lo = m(min) ?? m(max);
  const hi = m(max);
  return { ...(lo !== undefined ? { min: lo } : {}), ...(hi !== undefined && hi !== lo ? { max: hi } : {}) };
}
