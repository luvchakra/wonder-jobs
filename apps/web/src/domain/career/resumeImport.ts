import type { CareerDNA } from "./types";

/**
 * Reviewing a resume import against what the Career Profile already says (outcome spec §33–35:
 * "never silently overwrite confirmed information; surface conflicts").
 *
 * - A field the profile doesn't have yet is **new** and pre-ticked.
 * - A field that already says the same thing is **same** — nothing to do.
 * - A single-value field that says something different is a **conflict**: both values are shown and
 *   it starts unticked, so keeping what the candidate already confirmed is the default.
 * - A list field (skills, industries, locations) only ever **adds** the items that are missing —
 *   existing items (and a skill's self-rated level) are never removed or changed by an import.
 */
export type ImportField = "name" | "headline" | "yearsExperience" | "seniority" | "skills" | "industries" | "preferredLocations";

export interface ResumeImportDraft {
  name?: string;
  headline?: string;
  yearsExperience?: number;
  seniority?: CareerDNA["seniority"];
  skills?: CareerDNA["skills"];
  industries?: string[];
  preferredLocations?: string[];
  evidence: Partial<Record<ImportField, string>>;
}

export type ImportStatus = "new" | "same" | "conflict" | "adds";

export interface ImportFieldReview {
  field: ImportField;
  status: ImportStatus;
  /** What the profile says now, for display; empty when it has nothing. */
  current: string;
  /** What applying this field would set (for lists: only the items it adds). */
  incoming: string;
  defaultOn: boolean;
}

export type CurrentProfile = Partial<Pick<CareerDNA, ImportField>>;

export const IMPORT_FIELD_ORDER: ImportField[] = ["name", "headline", "yearsExperience", "seniority", "skills", "industries", "preferredLocations"];

const SCALARS = ["name", "headline", "yearsExperience", "seniority"] as const;
const norm = (s: string) => s.trim().toLowerCase();

function scalarText(field: (typeof SCALARS)[number], v: unknown): string {
  if (v === undefined || v === null || v === "" || (field === "yearsExperience" && v === 0)) return "";
  if (field === "yearsExperience") return `${v} years`;
  if (field === "seniority") return String(v)[0].toUpperCase() + String(v).slice(1);
  return String(v).trim();
}

function listNames(field: "skills" | "industries" | "preferredLocations", v: CurrentProfile[typeof field] | undefined): string[] {
  if (!v) return [];
  return field === "skills" ? (v as CareerDNA["skills"]).map((s) => s.name) : (v as string[]);
}

export function reviewResumeImport(draft: ResumeImportDraft, current: CurrentProfile): ImportFieldReview[] {
  const out: ImportFieldReview[] = [];
  for (const field of IMPORT_FIELD_ORDER) {
    if (!draft.evidence[field] || draft[field] === undefined) continue;
    if ((SCALARS as readonly string[]).includes(field)) {
      const f = field as (typeof SCALARS)[number];
      const incoming = scalarText(f, draft[f]);
      const now = scalarText(f, current[f]);
      if (!incoming) continue;
      const status: ImportStatus = !now ? "new" : norm(now) === norm(incoming) ? "same" : "conflict";
      out.push({ field, status, current: now, incoming, defaultOn: status === "new" });
    } else {
      const f = field as "skills" | "industries" | "preferredLocations";
      const have = listNames(f, current[f]);
      const seen = new Set(have.map(norm));
      const added = listNames(f, draft[f]).filter((n) => !seen.has(norm(n)));
      const status: ImportStatus = added.length === 0 ? "same" : have.length === 0 ? "new" : "adds";
      out.push({ field, status, current: have.join(", "), incoming: added.join(", "), defaultOn: status === "new" || status === "adds" });
    }
  }
  return out;
}

/** The patch for the ticked fields. List fields come back as the existing list plus the additions — never a replacement. */
export function buildImportPatch(draft: ResumeImportDraft, current: CurrentProfile, chosen: Iterable<ImportField>): Partial<CareerDNA> {
  const patch: Partial<CareerDNA> = {};
  for (const field of chosen) {
    if (draft[field] === undefined) continue;
    if (field === "skills") {
      const have = current.skills ?? [];
      const seen = new Set(have.map((s) => norm(s.name)));
      patch.skills = [...have, ...(draft.skills ?? []).filter((s) => !seen.has(norm(s.name)))];
    } else if (field === "industries" || field === "preferredLocations") {
      const have = current[field] ?? [];
      const seen = new Set(have.map(norm));
      patch[field] = [...have, ...(draft[field] ?? []).filter((n) => !seen.has(norm(n)))];
    } else {
      Object.assign(patch, { [field]: draft[field] });
    }
  }
  return patch;
}
