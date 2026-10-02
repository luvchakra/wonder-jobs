import type { PlanPrice } from "./types";

/** Minor units (paise, cents) → a localised price string, using the currency's own number of decimals. */
export function formatMoney(amountMinor: number, currency: string, locale = "en-IN"): string {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(amountMinor / 10 ** digits);
}

export function formatInterval(p: Pick<PlanPrice, "interval" | "intervalCount">): string {
  return p.intervalCount === 1 ? `per ${p.interval}` : `every ${p.intervalCount} ${p.interval}s`;
}
