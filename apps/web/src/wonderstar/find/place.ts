/** How a listing is worked: on-site, hybrid or remote. Every module's cards and filters use the same three. */
export type WorkMode = "remote" | "hybrid" | "onsite";

const MODE_WORD = /^(remote|hybrid|on-?site|in-?office)$/i;

/** A card's place: the first real place a listing names, with "+N" for the rest; work-mode words aren't places. */
export function shortPlace(location: string): string {
  const parts = location.split(/\s+[•·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
  const places = parts.filter((p) => !MODE_WORD.test(p));
  if (!places.length) return parts[0] ?? location;
  return places.length > 1 ? `${places[0]} +${places.length - 1}` : places[0];
}
