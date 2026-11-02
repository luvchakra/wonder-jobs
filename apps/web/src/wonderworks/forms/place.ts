/**
 * A listing's place with its country, as one string ("Indiranagar, Bengaluru, India"), for every module's posting
 * forms (owner, 2026-11-02: "make the posting forms ask for country too"). Pure, so forms and tests share it.
 */
// ISO 3166-1 alpha-2 codes; names come from the browser/runtime (Intl.DisplayNames), India first in the picker.
const CODES = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");

let cache: { code: string; name: string }[] | null = null;
/** Every country, India first, then by name. */
export function countries(): { code: string; name: string }[] {
  if (cache) return cache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  const list = CODES.map((code) => ({ code, name: names?.of(code) ?? code }));
  list.sort((a, b) => (a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name)));
  return (cache = list);
}

/** The place and its country from a stored place string: the country when its last part names one. */
export function splitCountry(value: string): { place: string; country: string } {
  const v = (value ?? "").trim();
  if (!v) return { place: "", country: "" };
  const parts = v.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1].toLowerCase();
  const hit = countries().find((c) => c.name.toLowerCase() === last || c.code.toLowerCase() === last || (c.code === "GB" && /^(uk|united kingdom)$/.test(last)) || (c.code === "US" && /^(usa|us|united states)$/.test(last)));
  return hit ? { place: parts.slice(0, -1).join(", "), country: hit.code } : { place: v, country: "" };
}

/** One place string from the place and the country picked. */
export function joinPlace(place: string, country: string): string {
  const p = place.trim().replace(/,\s*$/, "");
  const name = countries().find((c) => c.code === country)?.name ?? "";
  return p && name ? `${p}, ${name}` : p || name;
}
