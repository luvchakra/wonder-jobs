/**
 * Response mapping for custom sources (spec §28): a source's JSON → the fields JobsLake needs.
 * An admin points at the list of items and says which source field fills which JobsLake field;
 * validation says whether the result is good enough to serve, before anything is activated.
 */

export type MappableField = "sourceJobId" | "title" | "employer" | "location" | "description" | "applyUrl" | "postedAt" | "salaryMin" | "salaryMax" | "currency" | "remote";

export const MAPPABLE_FIELDS: { field: MappableField; label: string; required: boolean }[] = [
  { field: "sourceJobId", label: "Source job id", required: true },
  { field: "title", label: "Title", required: true },
  { field: "employer", label: "Employer name", required: true },
  { field: "location", label: "Location", required: true },
  { field: "description", label: "Description", required: true },
  { field: "applyUrl", label: "Apply URL", required: true },
  { field: "postedAt", label: "Posted at", required: true },
  { field: "salaryMin", label: "Salary min", required: false },
  { field: "salaryMax", label: "Salary max", required: false },
  { field: "currency", label: "Currency", required: false },
  { field: "remote", label: "Remote flag", required: false },
];

export const REQUIRED_FIELDS = MAPPABLE_FIELDS.filter((f) => f.required).map((f) => f.field);

export interface ResponseMapping {
  /** Dot path to the array of postings, e.g. `jobs` or `data.results`. Empty = the response is the array. */
  itemsPath: string;
  fields: Partial<Record<MappableField, string>>;
  /** Used when the source has no employer field (a single company's feed). */
  defaultEmployer?: string;
}

/** Reads `a.b[0].c` / `a.b.0.c` from a JSON value. Never evaluates code. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let cur: unknown = value;
  for (const seg of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export interface MappedItem {
  sourceJobId: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  applyUrl: string;
  postedAt: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  remote?: boolean;
}

const str = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).label ?? "") : String(x))).filter(Boolean).join(", ") : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export interface MappingResult {
  items: MappedItem[];
  totalItems: number;
  /** Per-field count of items that ended up with a value. */
  coverage: Record<MappableField, number>;
  issues: string[];
}

export function applyMapping(response: unknown, mapping: ResponseMapping): MappingResult {
  const list = getPath(response, mapping.itemsPath);
  const coverage = Object.fromEntries(MAPPABLE_FIELDS.map((f) => [f.field, 0])) as Record<MappableField, number>;
  if (!Array.isArray(list)) return { items: [], totalItems: 0, coverage, issues: [mapping.itemsPath ? `“${mapping.itemsPath}” isn't a list in the response.` : "The response isn't a list — set the path to the list of jobs."] };
  const items: MappedItem[] = [];
  for (const raw of list) {
    const read = (f: MappableField) => (mapping.fields[f] ? getPath(raw, mapping.fields[f]!) : undefined);
    const item: MappedItem = {
      sourceJobId: str(read("sourceJobId")),
      title: str(read("title")).trim(),
      employer: str(read("employer")).trim() || mapping.defaultEmployer?.trim() || "",
      location: str(read("location")).trim(),
      description: str(read("description")),
      applyUrl: str(read("applyUrl")).trim(),
      postedAt: str(read("postedAt")).trim(),
      salaryMin: num(read("salaryMin")),
      salaryMax: num(read("salaryMax")),
      currency: str(read("currency")).trim() || undefined,
      remote: mapping.fields.remote ? Boolean(read("remote")) : undefined,
    };
    for (const f of MAPPABLE_FIELDS) {
      const v = item[f.field as keyof MappedItem];
      if (v !== undefined && v !== "") coverage[f.field]++;
    }
    items.push(item);
  }
  return { items, totalItems: list.length, coverage, issues: [] };
}

/** A source date → ISO string: epoch seconds, epoch milliseconds or any parseable date text. */
export function toIsoDate(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{10}$/.test(v)) return new Date(Number(v) * 1000).toISOString();
  if (/^\d{13}$/.test(v)) return new Date(Number(v)).toISOString();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface MappingValidation {
  ok: boolean;
  checks: { label: string; ok: boolean; detail?: string }[];
}

/** The "Validation" panel under the mapping editor — each check is computed from the sample. */
export function validateMapping(mapping: ResponseMapping, result: MappingResult): MappingValidation {
  const n = result.totalItems;
  const missing = REQUIRED_FIELDS.filter((f) => !mapping.fields[f] && !(f === "employer" && mapping.defaultEmployer?.trim()));
  const pct = (f: MappableField) => (n ? result.coverage[f] / n : 0);
  const urlOk = result.items.filter((i) => /^https?:\/\//i.test(i.applyUrl)).length;
  const dateOk = result.items.filter((i) => toIsoDate(i.postedAt) !== null).length;
  const checks = [
    { label: "Jobs found in the response", ok: n > 0, detail: n ? `${n} items` : result.issues[0] ?? "No items" },
    { label: "Required fields mapped", ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(", ")}` : undefined },
    { label: "Every job has a title", ok: n > 0 && pct("title") === 1, detail: n ? `${result.coverage.title}/${n}` : undefined },
    { label: "Employer identity available", ok: n > 0 && pct("employer") === 1, detail: n ? `${result.coverage.employer}/${n}` : undefined },
    { label: "Apply URLs valid", ok: n > 0 && urlOk === n, detail: n ? `${urlOk}/${n} valid` : undefined },
    { label: "Posted dates readable", ok: n > 0 && dateOk === n, detail: n ? `${dateOk}/${n} readable` : undefined },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}
