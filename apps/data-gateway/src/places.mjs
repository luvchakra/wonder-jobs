/**
 * Place lookup for the prospect datasets (WJ-815): the cities the OpenStreetMap collection asks about, so a mapped
 * business with no address tag still gets the nearest one, and a search for "Pune" finds it. The same list as the app's
 * `wonderworks/find/cities.ts` (a web test keeps the two in step). A derived area, never an address.
 */
export const CITIES = Object.freeze([
  ["Delhi", 28.6139, 77.209],
  ["Ghaziabad", 28.6692, 77.4538],
  ["Chandigarh", 30.7333, 76.7794],
  ["Ludhiana", 30.901, 75.8573],
  ["Lucknow", 26.8467, 80.9462],
  ["Kanpur", 26.4499, 80.3319],
  ["Mumbai", 19.076, 72.8777],
  ["Pune", 18.5204, 73.8567],
  ["Ahmedabad", 23.0225, 72.5714],
  ["Surat", 21.1702, 72.8311],
  ["Vadodara", 22.3072, 73.1812],
  ["Indore", 22.7196, 75.8577],
  ["Bengaluru", 12.9716, 77.5946],
  ["Hyderabad", 17.385, 78.4867],
  ["Chennai", 13.0827, 80.2707],
  ["Coimbatore", 11.0168, 76.9558],
  ["Kochi", 9.9312, 76.2673],
  ["Thiruvananthapuram", 8.5241, 76.9366],
  ["Visakhapatnam", 17.6868, 83.2185],
  ["Kolkata", 22.5726, 88.3639],
  ["Patna", 25.5941, 85.1376],
  ["Guwahati", 26.1445, 91.7362],
  ["Nagpur", 21.1458, 79.0882],
  ["Bhopal", 23.2599, 77.4126],
  ["Jaipur", 26.9124, 75.7873],
  ["Nashik", 19.9975, 73.7898],
  ["Rajkot", 22.3039, 70.8022],
  ["Mysuru", 12.2958, 76.6394],
  ["Madurai", 9.9252, 78.1198],
  ["Vijayawada", 16.5062, 80.648],
  ["Bhubaneswar", 20.2961, 85.8245],].map(([name, lat, lon]) => Object.freeze({ name, lat, lon })));

/** Other names people type for the same city. */
const ALIASES = Object.freeze({
  bangalore: "bengaluru", bombay: "mumbai", calcutta: "kolkata", madras: "chennai", "new delhi": "delhi", trivandrum: "thiruvananthapuram",
  cochin: "kochi", baroda: "vadodara", vizag: "visakhapatnam", mysore: "mysuru", bhubaneshwar: "bhubaneswar", gauhati: "guwahati",
});

const RAD = Math.PI / 180;
/** Great-circle distance in kilometres. */
export function km(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How far from a city's centre a business is still "in" it (the collection asks 15 km around each; 25 leaves the outskirts in). */
export const CITY_RADIUS_KM = 25;

/** The nearest listed city to a point within `withinKm`, else undefined. */
export function nearestCity(lat, lon, withinKm = CITY_RADIUS_KM) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  let best;
  for (const city of CITIES) {
    const d = km(lat, lon, city.lat, city.lon);
    if (d <= withinKm && (!best || d < best.d)) best = { city, d };
  }
  return best?.city;
}

/** Every listed city within `withinKm` of a point. */
export function citiesNear(lat, lon, withinKm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(withinKm)) return [];
  return CITIES.filter((c) => km(lat, lon, c.lat, c.lon) <= withinKm);
}

/** The names a typed place may be stored under: itself, and the listed city it is another name for ("Bangalore" → "bengaluru"). */
export function placeNames(text) {
  const t = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out = new Set([t]);
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (t === alias || t.startsWith(alias + ",") || t.startsWith(alias + " ")) out.add(name);
    if (t === name) out.add(alias);
  }
  return [...out];
}
