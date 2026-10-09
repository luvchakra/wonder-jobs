/**
 * Shaping one of the candidate's own values to the field that asks for it: the form's own choice for
 * "Bachelor's" when it says "Bachelor's Degree" or "Graduate", "07/2001" when the box wants MM/YYYY,
 * "15+ years" for 21 years. Nothing is invented — a value that can't be shaped without guessing is
 * returned as not exact (offered to confirm) or not at all (left for the candidate).
 */
import { fieldText } from "./classify";
import { degreeLevel } from "./profile";
import { countryAliases } from "./places";
import type { ApplicationField, ProfileKey } from "./types";

export interface Shaped {
  /** What goes into the field, or undefined when nothing fits. */
  value?: string;
  /** False when shaping had to assume something (a day of the month) — the candidate confirms it. */
  exact: boolean;
}

const DATE_KEYS = new Set<ProfileKey>(["jobStartDate", "jobEndDate", "educationStartDate", "educationEndDate"]);

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, "");

/** Abbreviated degrees in full, so "B.Tech." finds "Bachelor of Technology". */
const DEGREE_FULL: [RegExp, string][] = [
  [/^b\.?\s?tech\.?$/i, "Bachelor of Technology"],
  [/^b\.?\s?e\.?$/i, "Bachelor of Engineering"],
  [/^b\.?\s?sc\.?$/i, "Bachelor of Science"],
  [/^b\.?\s?s\.?$/i, "Bachelor of Science"],
  [/^b\.?\s?a\.?$/i, "Bachelor of Arts"],
  [/^b\.?\s?com\.?$/i, "Bachelor of Commerce"],
  [/^m\.?\s?tech\.?$/i, "Master of Technology"],
  [/^m\.?\s?e\.?$/i, "Master of Engineering"],
  [/^m\.?\s?sc\.?$/i, "Master of Science"],
  [/^m\.?\s?s\.?$/i, "Master of Science"],
  [/^m\.?\s?a\.?$/i, "Master of Arts"],
  [/^m\.?\s?b\.?\s?a\.?$/i, "Master of Business Administration"],
  [/^ph\.?\s?d\.?$/i, "Doctor of Philosophy"],
];

/** How forms word each degree level. */
const LEVEL_OPTION: Record<string, { yes: RegExp; no?: RegExp }> = {
  Doctorate: { yes: /doctor|ph\.?\s?d|doctoral/ },
  "Master's": { yes: /master|post ?grad|\bpg\b|\bm\.?\s?(tech|e|sc|s|a|com)\b|\bmba\b/, no: /bachelor|under ?grad/ },
  "Bachelor's": { yes: /bachelor|under ?grad|^\s*(graduate|graduation|graduate degree)\s*$|\bb\.?\s?(tech|e|sc|s|a|com)\b/, no: /post|master|high school/ },
  Associate: { yes: /associate/ },
  Diploma: { yes: /diploma/, no: /post ?grad|pg/ },
  "High school": { yes: /high school|secondary|12th|\bhsc\b|10\+2|intermediate/ },
};

/** The one option that fits, or undefined when none or several do. */
function only<T>(hits: T[]): T | undefined {
  return hits.length === 1 ? hits[0] : undefined;
}

/** The option for a value: exact; then same letters; then a known synonym; then the one option that contains it. */
export function matchChoice(field: ApplicationField, value: string, key?: ProfileKey): string | undefined {
  const opts = field.options ?? [];
  if (!opts.length) return value;
  const v = value.trim().toLowerCase();
  const exact = opts.find((o) => o.label.trim().toLowerCase() === v || o.value.trim().toLowerCase() === v);
  if (exact) return exact.value;
  const nv = norm(value);
  if (!nv) return undefined;
  const same = only(opts.filter((o) => norm(o.label) === nv || norm(o.value) === nv));
  if (same) return same.value;

  if (key === "phoneCountryCode") {
    // "+91" → "India (+91)", "+91", "IN +91" — the digits as a whole code, never "+910".
    const digits = value.replace(/\D/g, "");
    const code = new RegExp(`(\\+\\s?|\\()${digits}(?!\\d)`);
    const hit = only(opts.filter((o) => code.test(o.label) || o.value.replace(/\D/g, "") === digits));
    if (hit) return hit.value;
  }
  if (key === "country") {
    const names = countryAliases(value).map(norm);
    const hit = only(opts.filter((o) => names.includes(norm(o.label)) || names.includes(norm(o.value))));
    if (hit) return hit.value;
  }
  // "Prefer not to say" in the candidate's words ↔ "I decline to self-identify" in the form's.
  const DECLINE = /\b(prefer not|decline|do not wish|don'?t wish|not to (say|disclose|answer|self-identify)|rather not)\b/i;
  if (DECLINE.test(value)) {
    const hit = only(opts.filter((o) => DECLINE.test(o.label)));
    if (hit) return hit.value;
  }
  if (key === "hasWorkExperience" || /^(yes|no)$/i.test(value.trim())) {
    const yes = /^yes$/i.test(value.trim());
    return only(opts.filter((o) => (yes ? /^\s*(yes|y|true)\b/i : /^\s*(no|n|false)\b/i).test(o.label)))?.value;
  }
  if (key === "degreeName" || key === "degreeType") {
    const full = DEGREE_FULL.find(([re]) => re.test(value.trim()))?.[1];
    if (full) {
      const hit = only(opts.filter((o) => norm(o.label).includes(norm(full))));
      if (hit) return hit.value;
    }
    const level = key === "degreeType" ? value : degreeLevel(value);
    const rule = level ? LEVEL_OPTION[level] : undefined;
    if (rule) {
      const hits = opts.filter((o) => rule.yes.test(o.label.toLowerCase()) && !(rule.no && rule.no.test(o.label.toLowerCase())));
      // "Bachelor's Degree" and "Bachelor of Arts" both say bachelor's — the general one is the answer.
      const general = hits.filter((o) => !/\bof\b|\bin\b/i.test(o.label));
      const hit = only(hits) ?? only(general);
      if (hit) return hit.value;
    }
  }
  if (nv.length >= 3) {
    const hit = only(opts.filter((o) => norm(o.label).includes(nv) || (norm(o.label).length >= 3 && nv.includes(norm(o.label)))));
    if (hit) return hit.value;
  }
  return undefined;
}

/** "21" against "0-2 years", "10+ years", "More than 15" → the option whose range holds it (the narrowest, when "5+" and "15+" both do). */
export function matchNumberChoice(field: ApplicationField, n: number): string | undefined {
  const hits: { value: string; lo: number }[] = [];
  for (const o of field.options ?? []) {
    const t = o.label.toLowerCase().replace(/,/g, "");
    const range = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/.exec(t);
    const plus = /(\d+(?:\.\d+)?)\s*\+|(more than|over|above|greater than|at least|minimum)\s*(\d+(?:\.\d+)?)/.exec(t);
    const under = /(less than|under|below|fewer than|up to)\s*(\d+(?:\.\d+)?)/.exec(t);
    const one = /^\D*(\d+(?:\.\d+)?)\D*$/.exec(t);
    if (range) {
      if (n >= Number(range[1]) && n <= Number(range[2])) hits.push({ value: o.value, lo: Number(range[1]) });
    } else if (plus) {
      const lo = Number(plus[1] ?? plus[3]);
      if (plus[1] || /at least|minimum/.test(plus[2]) ? n >= lo : n > lo) hits.push({ value: o.value, lo });
    } else if (under) {
      if (under[1] === "up to" ? n <= Number(under[2]) : n < Number(under[2])) hits.push({ value: o.value, lo: 0 });
    } else if (one && Number(one[1]) === n) hits.push({ value: o.value, lo: n });
  }
  if (hits.length <= 1) return hits[0]?.value;
  const top = Math.max(...hits.map((h) => h.lo));
  return only(hits.filter((h) => h.lo === top))?.value;
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "2001-07" or "2001" shaped to how the field asks: a date box, a month or year picker, or the format its hint shows. */
export function formatDate(field: ApplicationField, raw: string): Shaped {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(raw.trim());
  if (!m) return { exact: false };
  const [, y, mm] = m;
  const text = `${fieldText(field).all} ${field.hints?.placeholder ?? ""}`.toLowerCase();
  const wantsMonth = /\bmonth\b|\bmm\b/.test(text) && !/\byear\b|\byyyy\b/.test(text);
  const wantsYear = (/\byear\b|\byyyy\b/.test(text) && !/\bmonth\b|\bmm\b/.test(text)) || /\byear of\b|\bpassing year\b/.test(text);

  if (field.options?.length) {
    if (wantsMonth || field.options.some((o) => /^(jan|feb|mar)/i.test(o.label))) {
      if (!mm) return { exact: false };
      const name = MONTH_NAMES[Number(mm) - 1];
      const hit = only(field.options.filter((o) => o.label.toLowerCase().startsWith(name.slice(0, 3)) || o.value === mm || o.value === String(Number(mm)) || o.label === mm || o.label === String(Number(mm))));
      return { value: hit?.value, exact: true };
    }
    const hit = only(field.options.filter((o) => o.label.trim() === y || o.value.trim() === y));
    return { value: hit?.value, exact: true };
  }
  if (wantsYear) return { value: y, exact: true };
  if (wantsMonth) return mm ? { value: mm, exact: true } : { exact: false };
  if (field.type === "date") return mm ? { value: `${y}-${mm}-01`, exact: false } : { exact: false };
  if (/yyyy-mm-dd/.test(text)) return mm ? { value: `${y}-${mm}-01`, exact: false } : { exact: false };
  if (/mm\s*\/\s*dd\s*\/\s*yyyy/.test(text)) return mm ? { value: `${mm}/01/${y}`, exact: false } : { exact: false };
  if (/dd\s*\/\s*mm\s*\/\s*yyyy/.test(text)) return mm ? { value: `01/${mm}/${y}`, exact: false } : { exact: false };
  if (/yyyy-mm/.test(text)) return mm ? { value: `${y}-${mm}`, exact: true } : { exact: false };
  return mm ? { value: `${mm}/${y}`, exact: true } : { value: y, exact: true };
}

/** One of the candidate's profile values, shaped for this field. */
export function shapeProfileValue(field: ApplicationField, key: ProfileKey, raw: string, extra: { fullAddress?: string } = {}): Shaped {
  if (field.type === "checkbox" || field.type === "file") return { exact: false };
  if (DATE_KEYS.has(key)) return formatDate(field, raw);
  if (key === "yearsOfExperience") {
    const n = Number(raw);
    if (field.options?.length) return { value: Number.isFinite(n) ? matchNumberChoice(field, n) : undefined, exact: true };
    return { value: raw, exact: true };
  }
  // A single box for the whole address gets the whole address.
  if (key === "addressLine1" && field.type === "textarea" && extra.fullAddress) return { value: extra.fullAddress, exact: true };
  return { value: matchChoice(field, raw, key), exact: true };
}
