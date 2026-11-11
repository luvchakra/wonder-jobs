/** The cities the OpenStreetMap collection asks about (the same list as the app's wonderworks/find/cities.ts). */
export const CITIES: readonly { readonly name: string; readonly lat: number; readonly lon: number }[];
export function nearestCity(lat: number, lon: number, withinKm?: number): { name: string; lat: number; lon: number } | undefined;
