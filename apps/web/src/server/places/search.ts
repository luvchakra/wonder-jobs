/**
 * Place suggestions for a Location box: real cities and countries worldwide, from GeoNames (geonames.org,
 * CC BY 4.0) — every city with 15,000+ people, its region and country, largest first. The data ships with
 * the server (places.json) and is read once per instance, on the first search.
 */

/** Remote isn't a place — it's a work mode (Find's Work mode, the Career Profile's work modes). */
export interface PlaceSuggestion {
  /** What goes in the box ("Dubai"). */
  name: string;
  /** Where it is, to tell same-named places apart ("United Arab Emirates", "Ontario, Canada"). */
  detail: string;
  kind: "city" | "country";
}

interface PlacesData {
  countries: string[];
  /** [name, region, country index], largest city first. */
  cities: [string, string, number][];
}

/** Lower case, accents off: "São Paulo" and "sao paulo" are the same search. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Index {
  data: PlacesData;
  cityNames: string[];
  countryNames: string[];
}

let index: Promise<Index> | null = null;
function load(): Promise<Index> {
  index ??= import("./places.json").then((m) => {
    const data = (m.default ?? m) as unknown as PlacesData;
    return { data, cityNames: data.cities.map((c) => fold(c[0])), countryNames: data.countries.map(fold) };
  });
  return index;
}

/** Up to `limit` places whose name starts with what's typed (then any word of it), largest first. */
export function searchIn(ix: Index, text: string, limit = 8): PlaceSuggestion[] {
  const q = fold(text.trim());
  if (q.length < 2) return [];
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  const add = (p: PlaceSuggestion) => {
    const key = `${p.name}|${p.detail}`;
    if (out.length < limit && !seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  };
  ix.countryNames.forEach((c, i) => c.startsWith(q) && add({ name: ix.data.countries[i], detail: "Country", kind: "country" }));
  const city = (i: number) => {
    const [name, region, country] = ix.data.cities[i];
    add({ name, detail: [region, ix.data.countries[country]].filter(Boolean).join(", "), kind: "city" });
  };
  for (let i = 0; i < ix.cityNames.length && out.length < limit; i++) if (ix.cityNames[i].startsWith(q)) city(i);
  // "york" finds New York: a later word of the name.
  for (let i = 0; i < ix.cityNames.length && out.length < limit; i++) if (ix.cityNames[i].includes(` ${q}`) || ix.cityNames[i].includes(`-${q}`)) city(i);
  return out;
}

export async function searchPlaces(text: string, limit = 8): Promise<PlaceSuggestion[]> {
  return searchIn(await load(), text, limit);
}

/** For tests: the index over a small data set. */
export const indexOf = (data: PlacesData): Index => ({ data, cityNames: data.cities.map((c) => fold(c[0])), countryNames: data.countries.map(fold) });
