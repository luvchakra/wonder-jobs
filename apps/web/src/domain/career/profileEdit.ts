import type { CareerDNA } from "./types";
import { historyOf } from "./history";

/** A value with object keys sorted and `undefined` fields dropped, so two equal profiles always serialise alike. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

const comparable = (dna: CareerDNA) => JSON.stringify(canonical({ ...dna, updatedAt: undefined, history: historyOf(dna) }));

/**
 * Whether the Career Profile being edited differs from the saved one — by what the candidate can change,
 * not by bookkeeping: the save time, key order, and an empty work history written out in full
 * (leaving a field without typing) don't count as changes.
 */
export function profileChanged(draft: CareerDNA, saved: CareerDNA): boolean {
  return comparable(draft) !== comparable(saved);
}
