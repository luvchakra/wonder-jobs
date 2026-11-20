/** How a listing is worked: on-site, hybrid or remote. Every module's cards and filters use the same three. */
export type WorkMode = "remote" | "hybrid" | "onsite";

const MODE_WORD = /^(remote|hybrid|on-?site|in-?office)$/i;

/** A card's place: the first real place a listing names, with "+N" for the rest; work-mode words aren't places. */
export function shortPlace(location: string): string {
  // "Remote (Afghanistan, Albania, Algeria, …)": the first two of a long list in brackets, then how many more.
  const listed = /^([^(]*)\(([^)]*)\)\s*$/.exec(location.trim());
  if (listed) {
    const inside = listed[2].split(",").map((x) => x.trim()).filter(Boolean);
    if (inside.length > 3) return `${listed[1].trim()} (${inside.slice(0, 2).join(", ")} +${inside.length - 2})`.trim();
  }
  const parts = location.split(/\s+[•·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
  const places = parts.filter((p) => !MODE_WORD.test(p));
  if (!places.length) return parts[0] ?? location;
  return places.length > 1 ? `${places[0]} +${places.length - 1}` : places[0];
}
