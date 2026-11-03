import { cache } from "react";
import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { jobsLakeStore } from "@/server/jobslake/store";
import { shareOf as internshipShare } from "@/modules/internships/share";
import { shareOf as teachingShare } from "@/modules/teaching/share";
import { shareOf as servicesShare } from "@/modules/services/share";
import { shareOf as therapistsShare } from "@/modules/therapists/share";
import { shareOf as eventsShare } from "@/modules/events/share";
import { shareOf as marketplaceShare } from "@/modules/marketplace/share";
import { isTeachingTitle } from "@/modules/teaching/domain";
import { openInternships } from "@/server/internships/applications";
import { outside as outsideInternship, wonderworksInternship } from "@/server/internships/search";
import { openTeachingPosts } from "@/server/teaching/listings";
import { outside as outsideTeaching, wonderworksTeaching } from "@/server/teaching/search";
import { openServicePosts } from "@/server/services/listings";
import { outside as outsideService, wonderworksService } from "@/server/services/search";
import { openTherapistPosts } from "@/server/therapists/listings";
import { outside as outsideTherapist, wonderworksTherapist } from "@/server/therapists/search";
import { openEventPosts, seatCounts } from "@/server/events/listings";
import { wonderworksEvent } from "@/server/events/search";
import { openMarketListings, toListing } from "@/server/marketplace/listings";
import { outsideListing as outsideMarket } from "@/server/marketplace/search";
import { toOutsideEvent } from "@/server/events/outside";
import { shareOf as scholarshipShare } from "@/modules/scholarships/share";
import { openScholarships } from "@/server/scholarships/applications";
import { outside as outsideScholarship, wonderworksScholarship } from "@/server/scholarships/search";

/**
 * A listing's public page (`/s/<module>/<id>`): the listing as the module shows it, read from the public record —
 * a WonderWorks listing that is still open, or an outside posting WorksLake has found — and nothing from any person's
 * account. What it says is the module's own `shareOf`, the same words a shared message carries, so the link's preview
 * and the message never differ. People's profiles (Co-founders) are not here: they have no public page.
 */
export const SHARE_MODULES = ["internships", "teaching", "services", "therapists", "events", "marketplace", "scholarships"] as const;
export type ShareModule = (typeof SHARE_MODULES)[number];
export const isShareModule = (m: string): m is ShareModule => (SHARE_MODULES as readonly string[]).includes(m);

/** Where a module's own listings say they came from. */
const OWN = { internships: "WonderWorks companies", teaching: "WonderWorks schools", services: "WonderWorks pros", therapists: "WonderWorks practitioners", events: "WonderWorks events", marketplace: "WonderWorks listings", scholarships: "WonderWorks organisations" } as const;

const MAX = 1000;
const wsId = (id: string) => (id.startsWith("ws_") ? id.slice(3) : null);

async function pooled(id: string, module: ShareModule) {
  return jobsLakeStore().getOpportunity(id, module).catch(() => undefined);
}

async function load(module: ShareModule, id: string): Promise<ListingShareProps | null> {
  const own = wsId(id);
  switch (module) {
    case "internships": {
      if (own) {
        const p = (await openInternships(MAX)).find((x) => x.posting.id === own);
        return p ? internshipShare(wonderworksInternship(p, OWN.internships)) : null;
      }
      const o = await pooled(id, module);
      return o && o.jobType === "internship" ? internshipShare({ ...outsideInternship(o), id }) : null;
    }
    case "teaching": {
      if (own) {
        const p = (await openTeachingPosts(MAX)).find((x) => x.posting.id === own);
        return p ? teachingShare(wonderworksTeaching(p, OWN.teaching)) : null;
      }
      const o = await pooled(id, module);
      return o && isTeachingTitle(o.title) ? teachingShare({ ...outsideTeaching(o), id }) : null;
    }
    case "services": {
      if (own) {
        const p = (await openServicePosts(MAX)).find((x) => x.posting.id === own);
        return p ? servicesShare(wonderworksService(p, OWN.services)) : null;
      }
      const o = await pooled(id, module);
      return o ? servicesShare({ ...outsideService(o), id }) : null;
    }
    case "therapists": {
      if (own) {
        const p = (await openTherapistPosts(MAX)).find((x) => x.posting.id === own);
        return p ? therapistsShare(wonderworksTherapist(p, OWN.therapists)) : null;
      }
      // A practice from an open-data map (a business's public listing): what the map says, with its own page as the original.
      const o = await pooled(id, module);
      return o ? therapistsShare(outsideTherapist(o)) : null;
    }
    case "events": {
      if (!own) {
        // An outside event (`ow_<id>`): as its source lists it, while it hasn't ended.
        const o = id.startsWith("ow_") ? await pooled(id.slice(3), module) : undefined;
        const l = o ? toOutsideEvent(o) : null;
        return l ? eventsShare(l) : null;
      }
      const p = (await openEventPosts(MAX)).find((x) => x.posting.id === own);
      if (!p) return null;
      const seats = (await seatCounts([p.posting.id])).get(p.posting.id) ?? { going: 0, waiting: 0 };
      return eventsShare(wonderworksEvent(p, seats, OWN.events));
    }
    case "marketplace": {
      if (id.startsWith("mk_out_")) {
        // A shop's own item from an outside catalogue, while the shop still lists it in stock.
        const o = await pooled(id.slice(7), module);
        const l = o ? outsideMarket(o) : null;
        return l ? marketplaceShare(l) : null;
      }
      const r = (await openMarketListings(null, MAX)).find((x) => toListing(x).id === id);
      return r ? marketplaceShare({ ...toListing(r), sourceName: OWN.marketplace }) : null;
    }
    case "scholarships": {
      if (own) {
        const p = (await openScholarships(MAX)).find((x) => x.posting.id === own);
        return p ? scholarshipShare(wonderworksScholarship(p, OWN.scholarships)) : null;
      }
      // An outside one past its deadline, or asking a fee, is gone here too.
      const o = await pooled(id, module);
      const l = o ? outsideScholarship(o) : null;
      return l ? scholarshipShare({ ...l, id }) : null;
    }
  }
}

/** The listing as it is now, or null when it's gone, closed, or not a listing this module has. Read once per request. */
export const sharedListing = cache(async (module: string, rawId: string): Promise<ListingShareProps | null> => {
  const id = decodeURIComponent(rawId);
  if (!isShareModule(module) || !/^[\w.:-]{1,120}$/.test(id)) return null;
  return load(module, id).catch(() => null);
});
