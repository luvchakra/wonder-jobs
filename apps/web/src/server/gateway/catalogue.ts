import confsTech from "../../../../data-gateway/sources/confs-tech.json";
import edjoin from "../../../../data-gateway/sources/edjoin-california-schools.json";
import konfhubEvents from "../../../../data-gateway/sources/konfhub-events.json";
import linuxFoundationEvents from "../../../../data-gateway/sources/linux-foundation-events.json";
import osmCalendar from "../../../../data-gateway/sources/osm-calendar.json";
import osmServicesEast from "../../../../data-gateway/sources/osm-services-east.json";
import osmServicesNorth from "../../../../data-gateway/sources/osm-services-north.json";
import osmServicesSouth from "../../../../data-gateway/sources/osm-services-south.json";
import osmServicesWest from "../../../../data-gateway/sources/osm-services-west.json";
import osmTherapistsEast from "../../../../data-gateway/sources/osm-therapists-east.json";
import osmTherapistsNorth from "../../../../data-gateway/sources/osm-therapists-north.json";
import osmTherapistsSouth from "../../../../data-gateway/sources/osm-therapists-south.json";
import osmTherapistsWest from "../../../../data-gateway/sources/osm-therapists-west.json";
import teachaway from "../../../../data-gateway/sources/teachaway-international.json";
import ukTeachingVacancies from "../../../../data-gateway/sources/uk-teaching-vacancies.json";
import weWorkRemotely from "../../../../data-gateway/sources/we-work-remotely.json";

/**
 * The reviewed source definitions that ship with the gateway (`apps/data-gateway/sources/*.json`), so an admin can add
 * one from the Gateway page with a tap instead of running `register.mjs` with the admin token. Adding a file there means
 * adding it here too (a test checks every file is listed). A source is added paused, then tested and activated as usual.
 */
export const CATALOGUE: Record<string, Record<string, unknown>> = {
  "confs-tech.json": confsTech as Record<string, unknown>,
  "edjoin-california-schools.json": edjoin as Record<string, unknown>,
  "konfhub-events.json": konfhubEvents as Record<string, unknown>,
  "linux-foundation-events.json": linuxFoundationEvents as Record<string, unknown>,
  "osm-calendar.json": osmCalendar as Record<string, unknown>,
  "osm-services-east.json": osmServicesEast as Record<string, unknown>,
  "osm-services-north.json": osmServicesNorth as Record<string, unknown>,
  "osm-services-south.json": osmServicesSouth as Record<string, unknown>,
  "osm-services-west.json": osmServicesWest as Record<string, unknown>,
  "osm-therapists-east.json": osmTherapistsEast as Record<string, unknown>,
  "osm-therapists-north.json": osmTherapistsNorth as Record<string, unknown>,
  "osm-therapists-south.json": osmTherapistsSouth as Record<string, unknown>,
  "osm-therapists-west.json": osmTherapistsWest as Record<string, unknown>,
  "teachaway-international.json": teachaway as Record<string, unknown>,
  "uk-teaching-vacancies.json": ukTeachingVacancies as Record<string, unknown>,
  "we-work-remotely.json": weWorkRemotely as Record<string, unknown>,
};

export interface CatalogueEntry {
  file: string;
  name: string;
  kind: string;
  modules: string[];
  host: string;
  /** Already registered (a source with the same URL exists). */
  added: boolean;
  /** Its permission evidence says its terms are still to be confirmed by the owner. */
  termsPending: boolean;
}

export function catalogueEntries(registeredUrls: Set<string>): CatalogueEntry[] {
  return Object.entries(CATALOGUE).map(([file, s]) => ({
    file,
    name: String(s.attribution ?? file),
    kind: String(s.kind ?? ""),
    modules: (s.modules as string[]) ?? [],
    host: (() => {
      try {
        return new URL(String(s.url)).hostname;
      } catch {
        return "";
      }
    })(),
    added: registeredUrls.has(String(s.url)),
    termsPending: /terms (pending|to confirm)|confirms? (the|its|before)/i.test(String(s.permissionEvidence ?? "")),
  }));
}
