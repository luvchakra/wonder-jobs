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
  // Talent & Services keeps WonderWorks' Pipeline (Bookings) until its quote and booking flow ships.
  services: { Find: ServicesFind, You: ServicesYou, Profile: ServicesProfile, Listing: ServicePage, Company: ServicesCompany },
  teaching: { Find: TeachingFind, Pipeline: TeachingPipeline, You: TeachingYou, Profile: TeachingProfile, Listing: TeachingPage, Item: TeachingApplication, Company: TeachingCompany },
};

export const modulePages = (id: Exclude<ModuleId, "jobs"> | null): ModulePages => (id && PAGES[id]) || {};
