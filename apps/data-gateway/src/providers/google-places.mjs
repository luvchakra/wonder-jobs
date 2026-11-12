/**
 * Google Places as a live provider of businesses (WJ-822). Places API (New) Text Search, read on 2026-11-11:
 * developers.google.com/maps/documentation/places/web-service/text-search. POST places:searchText with the key in
 * X-Goog-Api-Key and a required field mask; 1 to 20 places a page, at most 60 across pages; the next page takes the
 * previous answer's nextPageToken with every other parameter unchanged.
 *
 * The field mask asks only for the place's id, name, address, map point, website, phone, types and Google Maps link.
 * Website and phone are billed at the Enterprise rate. Terms pending: Google's policies allow storing only the place
 * id (and a map point for 30 days) and forbid using Places content outside Google's services, so nothing here is
 * cached or stored, and every result says "Google Maps" with its link.
 */
import { categoryTag } from "../core.mjs";
import { blankBusiness, callJson, hostOf, httpsUrl, list, placeOf, countryOf, pointOf, str, wordsOf } from "./shared.mjs";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const FIELD_MASK = ["places.id", "places.displayName", "places.formattedAddress", "places.location", "places.websiteUri", "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.types", "places.googleMapsUri", "places.addressComponents", "nextPageToken"].join(",");
/** Types every place carries, which say nothing about what it does. */
const GENERIC = new Set(["pointofinterest", "establishment"]);

function business(p, at) {
  const name = str(p?.displayName?.text, 200);
  if (typeof p?.id !== "string" || !/^[\w-]{5,300}$/.test(p.id) || !name) return null;
  const part = (type, short = false) => str(list(p.addressComponents).find((c) => list(c?.types).includes(type))?.[short ? "shortText" : "longText"], 80);
  const website = httpsUrl(p.websiteUri);
  const lat = typeof p.location?.latitude === "number" ? p.location.latitude : null, lon = typeof p.location?.longitude === "number" ? p.location.longitude : null;
  const country = part("country", true);
  const link = httpsUrl(p.googleMapsUri);
  return {
    ...blankBusiness(), id: "google_places_" + p.id, name, website, domain: website ? hostOf(website) : null,
    phone: str(p.internationalPhoneNumber, 60) ?? str(p.nationalPhoneNumber, 60),
    categories: [...new Set(list(p.types).filter((t) => typeof t === "string").map(categoryTag).filter((t) => t.length >= 2 && t.length <= 40 && !GENERIC.has(t)))].slice(0, 8),
    location: { text: str(p.formattedAddress, 180), city: part("locality"), region: part("administrative_area_level_1"), country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null, postcode: part("postal_code")?.slice(0, 12) ?? null, lat, lon },
    source: { id: "google_places", provider: "google_places", name: "Google Maps", url: link, termsPending: true },
    observedAt: at,
  };
}

export default {
  id: "google_places", label: "Google Places", kinds: ["business"], paid: true, units: 1, coverage: ["global"], attribution: "Google Maps", termsPending: true,
  keys: ["GOOGLE_PLACES_API_KEY"], maxPage: 20, defaultCacheHours: 0,
  async search(plan, ctx) {
    const point = pointOf(plan), place = placeOf(plan), country = countryOf(plan);
    const body = {
      textQuery: [wordsOf(plan), place ? "in " + place : ""].filter(Boolean).join(" "), pageSize: ctx.size,
      ...(country ? { regionCode: country } : {}),
      ...(point ? { locationBias: { circle: { center: { latitude: point.lat, longitude: point.lon }, radius: Math.min(50000, Math.round(point.radiusKm * 1000)) } } } : {}),
      ...(ctx.token ? { pageToken: ctx.token } : {}),
    };
    const answer = await callJson(ctx, ENDPOINT, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": ctx.keys.GOOGLE_PLACES_API_KEY, "x-goog-fieldmask": FIELD_MASK }, body: JSON.stringify(body) });
    const at = new Date(ctx.now).toISOString();
    return { items: list(answer?.places).map((p) => business(p, at)).filter(Boolean), next: typeof answer?.nextPageToken === "string" && answer.nextPageToken ? answer.nextPageToken : null };
  },
};
