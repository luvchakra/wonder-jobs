/** Formatting helpers shared by product and marketing surfaces. */

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatNumber(n: number) {
  return INR.format(n);
}

/** ₹28L–45L style salary ranges. Amounts are annual INR. */
export function formatSalaryRange(min?: number, max?: number, currency = "INR") {
  if (min == null && max == null) return null;
  const toLakh = (v: number) => `${Math.round(v / 100_000)}L`;
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  if (currency !== "INR") {
    const k = (v: number) => `${Math.round(v / 1000)}k`;
    if (min != null && max != null) return `${sym}${k(min)}–${k(max)}`;
    return `${sym}${k((min ?? max) as number)}`;
  }
  if (min != null && max != null) return `${sym}${toLakh(min)}–${toLakh(max)}`;
  return `${sym}${toLakh((min ?? max) as number)}`;
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const m = Math.round(abs / 60_000);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  let s: string;
  if (m < 1) s = "just now";
  else if (m < 60) s = `${m} min`;
  else if (h < 24) s = `${h} hour${h === 1 ? "" : "s"}`;
  else if (d < 7) s = `${d} day${d === 1 ? "" : "s"}`;
  else if (d < 30) s = `${Math.round(d / 7)} week${Math.round(d / 7) === 1 ? "" : "s"}`;
  else s = `${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"}`;
  if (s === "just now") return s;
  return future ? `in ${s}` : `${s} ago`;
}

// Intl formatters are expensive to construct; `toLocaleDateString` builds one per call.
const formatters = new Map<string, Intl.DateTimeFormat>();
function dateFormatter(opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IN", opts);
    formatters.set(key, f);
  }
  return f;
}
const DEFAULT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = DEFAULT_DATE) {
  return dateFormatter(opts).format(new Date(iso));
}

export function formatTime(iso: string) {
  return dateFormatter(TIME).format(new Date(iso));
}

export function formatDuration(ms: number) {
  ms = Math.max(0, Math.round(ms)); // clocks tick by the minute in the UI; never show a negative elapsed time
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function titleCase(s: string) {
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortId(id: string) {
  return id.slice(0, 8);
}
