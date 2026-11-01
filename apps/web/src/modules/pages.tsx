import type { ComponentType } from "react";
import { InternshipsFind } from "./internships/components/Find";
import { InternshipsPipeline } from "./internships/components/Pipeline";
import { InternshipsProfile, InternshipsYou } from "./internships/components/You";
import { InternshipPage } from "./internships/components/InternshipPage";
import { InternshipApplication } from "./internships/components/Application";
import { InternshipsCompany } from "./internships/components/Company";
import { TeachingFind } from "./teaching/components/Find";
import { TeachingProfile, TeachingYou } from "./teaching/components/You";
import { TeachingPage } from "./teaching/components/TeachingPage";
import { TeachingPipeline } from "./teaching/components/Pipeline";
import { TeachingApplication } from "./teaching/components/Application";
import { TeachingCompany } from "./teaching/components/Company";
import { ServicesFind } from "./services/components/Find";
import { ServicesProfile, ServicesYou } from "./services/components/You";
import { ServicePage } from "./services/components/ServicePage";
import { ServicesCompany } from "./services/components/Company";
import { ServicesBookings } from "./services/components/Bookings";
import { ServicesBooking } from "./services/components/Booking";
import { TherapistsFind } from "./therapists/components/Find";
import { TherapistsProfile, TherapistsYou } from "./therapists/components/You";
import { TherapistPage } from "./therapists/components/TherapistPage";
import { TherapistsCompany } from "./therapists/components/Company";
import { TherapistsSessions } from "./therapists/components/Sessions";
import { TherapistsSession } from "./therapists/components/Session";
import { EventsFind } from "./events/components/Find";
import { EventsPipeline } from "./events/components/Pipeline";
import { EventsItem } from "./events/components/Item";
import { EventsProfile, EventsYou } from "./events/components/You";
import { EventPage } from "./events/components/EventPage";
import { EventsCompany } from "./events/components/Company";
import { CofoundersFind } from "./cofounders/components/Find";
import { CofoundersPipeline } from "./cofounders/components/Pipeline";
import { CofoundersConnection } from "./cofounders/components/Connection";
import { CofoundersProfile, CofoundersYou } from "./cofounders/components/You";
import { CofounderPage } from "./cofounders/components/CofounderPage";
import { CofoundersTeams } from "./cofounders/components/Teams";
import { MarketplaceFind } from "./marketplace/components/Find";
import { MarketplacePipeline } from "./marketplace/components/Pipeline";
import { MarketplaceItem } from "./marketplace/components/Item";
import { MarketplaceProfile, MarketplaceYou } from "./marketplace/components/You";
import { MarketPage } from "./marketplace/components/MarketPage";
import { MarketplaceCompany } from "./marketplace/components/Company";
import { ScholarshipsFind } from "./scholarships/components/Find";
import { ScholarshipsProfile, ScholarshipsYou } from "./scholarships/components/You";
import { ScholarshipPage } from "./scholarships/components/ScholarshipPage";
import { ScholarshipsCompany } from "./scholarships/components/Company";
import { ScholarshipsPipeline } from "./scholarships/components/Pipeline";
import { ScholarshipApplication } from "./scholarships/components/Application";
import type { ModuleId } from "./registry";

/**
 * Each live module's own pages at /app/m/<module>/… (the composition root, so a shell route never names a module). A
 * page a module leaves out falls back to WonderWorks' (Find, Pipeline, You) or is a 404 (the rest).
 */
export interface ModulePages {
  Find?: ComponentType;
  Pipeline?: ComponentType;
  You?: ComponentType;
  /** You → its persona details. */
  Profile?: ComponentType;
  /** A listing's own page. */
  Listing?: ComponentType<{ id: string }>;
  /** One item in its Pipeline tab. */
  Item?: ComponentType<{ id: string }>;
  /** The owner side (a company's or school's workspace). */
  Company?: ComponentType;
}

const PAGES: Partial<Record<Exclude<ModuleId, "jobs">, ModulePages>> = {
  internships: { Find: InternshipsFind, Pipeline: InternshipsPipeline, You: InternshipsYou, Profile: InternshipsProfile, Listing: InternshipPage, Item: InternshipApplication, Company: InternshipsCompany },
  services: { Find: ServicesFind, Pipeline: ServicesBookings, You: ServicesYou, Profile: ServicesProfile, Listing: ServicePage, Item: ServicesBooking, Company: ServicesCompany },
  therapists: { Find: TherapistsFind, Pipeline: TherapistsSessions, You: TherapistsYou, Profile: TherapistsProfile, Listing: TherapistPage, Item: TherapistsSession, Company: TherapistsCompany },
  events: { Find: EventsFind, Pipeline: EventsPipeline, You: EventsYou, Profile: EventsProfile, Listing: EventPage, Item: EventsItem, Company: EventsCompany },
  cofounders: { Find: CofoundersFind, Pipeline: CofoundersPipeline, You: CofoundersYou, Profile: CofoundersProfile, Listing: CofounderPage, Item: CofoundersConnection, Company: CofoundersTeams },
  marketplace: { Find: MarketplaceFind, Pipeline: MarketplacePipeline, You: MarketplaceYou, Profile: MarketplaceProfile, Listing: MarketPage, Item: MarketplaceItem, Company: MarketplaceCompany },
  scholarships: { Find: ScholarshipsFind, Pipeline: ScholarshipsPipeline, You: ScholarshipsYou, Profile: ScholarshipsProfile, Listing: ScholarshipPage, Item: ScholarshipApplication, Company: ScholarshipsCompany },
  teaching: { Find: TeachingFind, Pipeline: TeachingPipeline, You: TeachingYou, Profile: TeachingProfile, Listing: TeachingPage, Item: TeachingApplication, Company: TeachingCompany },
};

export const modulePages = (id: Exclude<ModuleId, "jobs"> | null): ModulePages => (id && PAGES[id]) || {};
