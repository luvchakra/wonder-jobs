"use client";
import { Input, Select } from "@/components/common/Input";

/** One id per form submission: a retry of the same submit reuses it, so the server never creates twice. */
export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Decimal places of a currency's minor unit (2 for INR/USD, 0 for JPY). */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "499.00" in INR → 49900. NaN for anything that isn't a positive amount. */
export function toMinor(major: string, currency: string): number {
  const n = Number(major);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10 ** minorDigits(currency)) : NaN;
}

export const label = "text-[12px] font-medium text-ink-3";

export interface DiscountDraft {
  kind: "percent" | "amount";
  value: string;
  currency: string;
  duration: "once" | "repeating" | "forever";
  months: string;
  expires: string;
}

export const emptyDiscount = (currency: string): DiscountDraft => ({ kind: "percent", value: "", currency, duration: "once", months: "3", expires: "" });

/** The draft as the API takes it, or a reason it can't be sent yet. */
export function discountPayload(d: DiscountDraft): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const discount = d.kind === "percent" ? { kind: "percent", percentOff: Number(d.value) } : { kind: "amount", amountOffMinor: toMinor(d.value, d.currency), currency: d.currency.toUpperCase() };
  if (d.kind === "percent" && !(Number.isInteger(Number(d.value)) && Number(d.value) >= 1 && Number(d.value) <= 100)) return { ok: false, error: "Percent off is a whole number from 1 to 100." };
  if (d.kind === "amount" && !Number.isFinite(toMinor(d.value, d.currency))) return { ok: false, error: "Enter an amount above zero." };
  const months = Number(d.months);
  if (d.duration === "repeating" && !(Number.isInteger(months) && months >= 1 && months <= 36)) return { ok: false, error: "Months is a whole number from 1 to 36." };
  let expiresAt: string | undefined;
  if (d.expires) {
    // The end of the chosen day, in the admin's own time zone.
    const t = new Date(`${d.expires}T23:59:59`);
    if (!Number.isFinite(t.getTime()) || t.getTime() <= Date.now()) return { ok: false, error: "The expiry must be in the future." };
    expiresAt = t.toISOString();
  }
  return { ok: true, value: { discount, duration: d.duration, ...(d.duration === "repeating" ? { durationInMonths: months } : {}), ...(expiresAt ? { expiresAt } : {}) } };
}

/** Percent or amount off, how long, and an optional last day. */
export function DiscountFields({ draft, onChange, idPrefix }: { draft: DiscountDraft; onChange: (d: DiscountDraft) => void; idPrefix: string }) {
  const set = (patch: Partial<DiscountDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor={`${idPrefix}-kind`}>
          Discount
        </label>
        <Select id={`${idPrefix}-kind`} value={draft.kind} onChange={(e) => set({ kind: e.target.value as DiscountDraft["kind"] })}>
          <option value="percent">Percent off</option>
          <option value="amount">Amount off</option>
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className={label} htmlFor={`${idPrefix}-value`}>
            {draft.kind === "percent" ? "Percent" : "Amount"}
          </label>
          <Input id={`${idPrefix}-value`} type="number" inputMode="decimal" min={0} value={draft.value} onChange={(e) => set({ value: e.target.value })} />
        </div>
        {draft.kind === "amount" && (
          <div>
            <label className={label} htmlFor={`${idPrefix}-ccy`}>
              Currency
            </label>
            <Input id={`${idPrefix}-ccy`} value={draft.currency} maxLength={3} className="w-20 uppercase" onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className={label} htmlFor={`${idPrefix}-duration`}>
            For
          </label>
          <Select id={`${idPrefix}-duration`} value={draft.duration} onChange={(e) => set({ duration: e.target.value as DiscountDraft["duration"] })}>
            <option value="once">The first payment</option>
            <option value="repeating">A number of months</option>
            <option value="forever">Every payment</option>
          </Select>
        </div>
        {draft.duration === "repeating" && (
          <div>
            <label className={label} htmlFor={`${idPrefix}-months`}>
              Months
            </label>
            <Input id={`${idPrefix}-months`} type="number" inputMode="numeric" min={1} max={36} value={draft.months} className="w-20" onChange={(e) => set({ months: e.target.value })} />
          </div>
        )}
      </div>
      <div>
        <label className={label} htmlFor={`${idPrefix}-expires`}>
          Last day to use it (optional)
        </label>
        <Input id={`${idPrefix}-expires`} type="date" value={draft.expires} onChange={(e) => set({ expires: e.target.value })} />
      </div>
    </div>
  );
}
