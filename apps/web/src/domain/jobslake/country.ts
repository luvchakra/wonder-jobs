/**
 * Every listing's place names its country (owner, 2026-11-02: "ensure the country is mentioned in the card and the
 * details page … do it for all modules"). Applied to every WorksLake source's results, so every module's cards and
 * detail pages get it; the data gateway does the same for its own listings (apps/data-gateway handler.mjs).
 */
const ALIASES: Record<string, string[]> = { GB: ["uk", "u.k.", "england", "scotland", "wales", "northern ireland", "great britain"], US: ["usa", "u.s.a.", "u.s.", "us"], AE: ["uae"] };
const REMOTE_ONLY = /^(remote|anywhere|worldwide|online)$/i;

export function countryName(code: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(code) || code === "EU") return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || undefined;
  } catch {
    return undefined;
  }
}

/** The place with its country after it, unless it already names it (or is just "Remote"). */
export function withCountry(location: string, code: string | null | undefined): string {
  const loc = (location ?? "").trim();
  const name = code ? countryName(code) : undefined;
  if (!name || REMOTE_ONLY.test(loc)) return loc;
  if (!loc) return name;
  const low = loc.toLowerCase();
  const named = [name.toLowerCase(), ...(ALIASES[code!] ?? [])].some((n) => new RegExp(`(^|[\\s,(/-])${n.replace(/[.]/g, "\\.")}($|[\\s,)/-])`).test(low));
  return named ? loc : `${loc}, ${name}`;
}

/** The one country a source covers, from its geography: a single country code, never with "global". */
export function singleCountry(geography: string[] | undefined): string | null {
  const geo = geography ?? [];
  if (geo.includes("global")) return null;
  const codes = geo.filter((g) => /^[A-Z]{2}$/.test(g) && g !== "EU");
  return codes.length === 1 ? codes[0] : null;
}

/** A source's jobs with their country named in the place: the job's own country, else the source's single one. */
export function placeWithCountry<T extends { location: string; country?: string; workMode?: string }>(jobs: T[], geography: string[] | undefined): T[] {
  const fallback = singleCountry(geography);
  return jobs.map((j) => {
    const code = j.country && /^[A-Z]{2}$/.test(j.country) ? j.country : j.workMode === "remote" ? null : fallback;
    const location = withCountry(j.location, code);
    return location === j.location ? j : { ...j, location, ...(code && !j.country ? { country: code } : {}) };
  });
}
