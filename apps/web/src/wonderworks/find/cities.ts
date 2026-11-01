// Shared by Talent & Services and Therapists. Generated with the definition files (apps/data-gateway/sources/osm-services-*.json and osm-therapists-*.json): the same cities, so a business or practice is given the nearest one.
export interface City { name: string; lat: number; lon: number; region: "north" | "west" | "south" | "east" | "more" }
export const CITIES: City[] = [
  { name: "Delhi", lat: 28.6139, lon: 77.209, region: "north" },
  { name: "Ghaziabad", lat: 28.6692, lon: 77.4538, region: "north" },
  { name: "Chandigarh", lat: 30.7333, lon: 76.7794, region: "north" },
  { name: "Ludhiana", lat: 30.901, lon: 75.8573, region: "north" },
  { name: "Lucknow", lat: 26.8467, lon: 80.9462, region: "north" },
  { name: "Kanpur", lat: 26.4499, lon: 80.3319, region: "north" },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, region: "west" },
  { name: "Pune", lat: 18.5204, lon: 73.8567, region: "west" },
  { name: "Ahmedabad", lat: 23.0225, lon: 72.5714, region: "west" },
  { name: "Surat", lat: 21.1702, lon: 72.8311, region: "west" },
  { name: "Vadodara", lat: 22.3072, lon: 73.1812, region: "west" },
  { name: "Indore", lat: 22.7196, lon: 75.8577, region: "west" },
  { name: "Bengaluru", lat: 12.9716, lon: 77.5946, region: "south" },
  { name: "Hyderabad", lat: 17.385, lon: 78.4867, region: "south" },
  { name: "Chennai", lat: 13.0827, lon: 80.2707, region: "south" },
  { name: "Coimbatore", lat: 11.0168, lon: 76.9558, region: "south" },
  { name: "Kochi", lat: 9.9312, lon: 76.2673, region: "south" },
  { name: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366, region: "south" },
  { name: "Visakhapatnam", lat: 17.6868, lon: 83.2185, region: "south" },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639, region: "east" },
  { name: "Patna", lat: 25.5941, lon: 85.1376, region: "east" },
  { name: "Guwahati", lat: 26.1445, lon: 91.7362, region: "east" },
  { name: "Nagpur", lat: 21.1458, lon: 79.0882, region: "east" },
  { name: "Bhopal", lat: 23.2599, lon: 77.4126, region: "east" },
  { name: "Jaipur", lat: 26.9124, lon: 75.7873, region: "more" },
  { name: "Nashik", lat: 19.9975, lon: 73.7898, region: "more" },
  { name: "Rajkot", lat: 22.3039, lon: 70.8022, region: "more" },
  { name: "Mysuru", lat: 12.2958, lon: 76.6394, region: "more" },
  { name: "Madurai", lat: 9.9252, lon: 78.1198, region: "more" },
  { name: "Vijayawada", lat: 16.5062, lon: 80.648, region: "more" },
  { name: "Bhubaneswar", lat: 20.2961, lon: 85.8245, region: "more" },
];

const RAD = Math.PI / 180;
/** Great-circle distance in kilometres. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How far from a city's centre a business is still "in" it. The collection asks each city for 15 km around its centre; 25 leaves room for the outskirts. */
export const CITY_RADIUS_KM = 25;

/** The nearest city to a point, if one is within CITY_RADIUS_KM. A derived area ("near Pune"), never an address. */
export function nearestCity(lat: number, lon: number): City | undefined {
  let best: { city: City; d: number } | undefined;
  for (const city of CITIES) {
    const d = km(lat, lon, city.lat, city.lon);
    if (d <= CITY_RADIUS_KM && (!best || d < best.d)) best = { city, d };
  }
  return best?.city;
}
