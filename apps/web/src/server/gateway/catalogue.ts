import apnaInternships from "../../../../data-gateway/sources/apna-internships.json";
import confsTech from "../../../../data-gateway/sources/confs-tech.json";
import devfolioHackathons from "../../../../data-gateway/sources/devfolio-hackathons.json";
import districtEvents from "../../../../data-gateway/sources/district-events.json";
import edjoin from "../../../../data-gateway/sources/edjoin-california-schools.json";
import jobsAcUk from "../../../../data-gateway/sources/jobs-ac-uk.json";
import wedmegood1 from "../../../../data-gateway/sources/wedmegood-vendors-1.json";
import wedmegood2 from "../../../../data-gateway/sources/wedmegood-vendors-2.json";
import wedmegood3 from "../../../../data-gateway/sources/wedmegood-vendors-3.json";
import wedmegood4 from "../../../../data-gateway/sources/wedmegood-vendors-4.json";
import hackerearthEvents from "../../../../data-gateway/sources/hackerearth-events.json";
import hasgeekEvents from "../../../../data-gateway/sources/hasgeek-events.json";
import helsinkiLinkedEvents from "../../../../data-gateway/sources/helsinki-linkedevents.json";
import houzzInteriorDesignersAndDecorators from "../../../../data-gateway/sources/houzz-interior-designers-and-decorators.json";
import houzzArchitects from "../../../../data-gateway/sources/houzz-architects.json";
import houzzDesignBuildFirms from "../../../../data-gateway/sources/houzz-design-build-firms.json";
import houzzCivilEngineersAndContractors from "../../../../data-gateway/sources/houzz-civil-engineers-and-contractors.json";
import houzzConstruction from "../../../../data-gateway/sources/houzz-construction.json";
import houzzSpecialtyContractors from "../../../../data-gateway/sources/houzz-specialty-contractors.json";
import houzzKitchenAndBathDesigners from "../../../../data-gateway/sources/houzz-kitchen-and-bath-designers.json";
import houzzFlooringAndCarpet from "../../../../data-gateway/sources/houzz-flooring-and-carpet.json";
import houzzTileStoneAndCountertops from "../../../../data-gateway/sources/houzz-tile-stone-and-countertops.json";
import houzzLandscapeArchitectsAndContractors from "../../../../data-gateway/sources/houzz-landscape-architects-and-contractors.json";
import konfhubEvents from "../../../../data-gateway/sources/konfhub-events.json";
import linuxFoundationEvents from "../../../../data-gateway/sources/linux-foundation-events.json";
import osmCalendar from "../../../../data-gateway/sources/osm-calendar.json";
import osmServicesEast from "../../../../data-gateway/sources/osm-services-east.json";
import osmServicesMore from "../../../../data-gateway/sources/osm-services-more.json";
import osmServicesNorth from "../../../../data-gateway/sources/osm-services-north.json";
import osmServicesSouth from "../../../../data-gateway/sources/osm-services-south.json";
import osmServicesWest from "../../../../data-gateway/sources/osm-services-west.json";
import osmTherapistsEast from "../../../../data-gateway/sources/osm-therapists-east.json";
import osmTherapistsMore from "../../../../data-gateway/sources/osm-therapists-more.json";
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
  "apna-internships.json": apnaInternships as Record<string, unknown>,
  "confs-tech.json": confsTech as Record<string, unknown>,
  "devfolio-hackathons.json": devfolioHackathons as Record<string, unknown>,
  "district-events.json": districtEvents as Record<string, unknown>,
  "edjoin-california-schools.json": edjoin as Record<string, unknown>,
  "jobs-ac-uk.json": jobsAcUk as Record<string, unknown>,
  "wedmegood-vendors-1.json": wedmegood1 as Record<string, unknown>,
  "wedmegood-vendors-2.json": wedmegood2 as Record<string, unknown>,
  "wedmegood-vendors-3.json": wedmegood3 as Record<string, unknown>,
  "wedmegood-vendors-4.json": wedmegood4 as Record<string, unknown>,
  "hackerearth-events.json": hackerearthEvents as Record<string, unknown>,
  "hasgeek-events.json": hasgeekEvents as Record<string, unknown>,
  "helsinki-linkedevents.json": helsinkiLinkedEvents as Record<string, unknown>,
  "houzz-interior-designers-and-decorators.json": houzzInteriorDesignersAndDecorators as Record<string, unknown>,
  "houzz-architects.json": houzzArchitects as Record<string, unknown>,
  "houzz-design-build-firms.json": houzzDesignBuildFirms as Record<string, unknown>,
  "houzz-civil-engineers-and-contractors.json": houzzCivilEngineersAndContractors as Record<string, unknown>,
  "houzz-construction.json": houzzConstruction as Record<string, unknown>,
  "houzz-specialty-contractors.json": houzzSpecialtyContractors as Record<string, unknown>,
  "houzz-kitchen-and-bath-designers.json": houzzKitchenAndBathDesigners as Record<string, unknown>,
  "houzz-flooring-and-carpet.json": houzzFlooringAndCarpet as Record<string, unknown>,
  "houzz-tile-stone-and-countertops.json": houzzTileStoneAndCountertops as Record<string, unknown>,
  "houzz-landscape-architects-and-contractors.json": houzzLandscapeArchitectsAndContractors as Record<string, unknown>,
  "konfhub-events.json": konfhubEvents as Record<string, unknown>,
  "linux-foundation-events.json": linuxFoundationEvents as Record<string, unknown>,
  "osm-calendar.json": osmCalendar as Record<string, unknown>,
  "osm-services-east.json": osmServicesEast as Record<string, unknown>,
  "osm-services-more.json": osmServicesMore as Record<string, unknown>,
  "osm-services-north.json": osmServicesNorth as Record<string, unknown>,
  "osm-services-south.json": osmServicesSouth as Record<string, unknown>,
  "osm-services-west.json": osmServicesWest as Record<string, unknown>,
  "osm-therapists-east.json": osmTherapistsEast as Record<string, unknown>,
  "osm-therapists-more.json": osmTherapistsMore as Record<string, unknown>,
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
  /** The countries it covers, as its definition states. */
  geography: string[];
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
    geography: Array.isArray(s.geography) ? (s.geography as string[]) : [],
    termsPending: /terms (pending|to confirm)|confirms? (the|its|before)/i.test(String(s.permissionEvidence ?? "")),
  }));
}
