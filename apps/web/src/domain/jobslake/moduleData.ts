import type { ModuleId } from "@/wonderworks/manifest";

/**
 * What each module's sources fetch (owner, 2026-11-01: "put a category for each source to show which module it's
 * searching based on data type it's fetching"). Every source belongs to one module's dataset; this says what kind of
 * record that dataset holds and which fields matter, for the admin's Sources and Setup pages.
 */
export const MODULE_DATA: Record<ModuleId, { type: string; info: string }> = {
  jobs: { type: "Job postings", info: "Full-time and part-time jobs: title, employer, place, work mode, pay when stated, and the apply link. Searched by Find in Jobs." },
  internships: { type: "Internship postings", info: "Internships and student roles: title, organisation, place, stipend and duration when stated, and the apply link." },
  teaching: { type: "Teaching jobs", info: "Roles at schools, colleges and tutoring: title, school, place, subject and level when stated, and the apply link." },
  cofounders: { type: "Founder profiles", info: "Only what founders chose to list on WonderWorks; never profiles collected from elsewhere." },
  services: { type: "Local businesses & pros", info: "Tradespeople and service businesses: name, trade, area, and a link. No personal phone numbers or emails." },
  therapists: { type: "Practitioners & practices", info: "Therapy and wellness practices, as they describe themselves: name, approach, area, and a link." },
  events: { type: "Events", info: "Conferences, meetups and shows: name, organiser, dates, place or online, and the event's own page. Cancelled and finished events are left out." },
  marketplace: { type: "Items to buy, sell or rent", info: "Listings posted on WonderWorks: item, condition, price, area." },
  scholarships: { type: "Scholarships & projects", info: "Scholarships, grants and student projects: provider, amount, eligibility, deadline, and the official page." },
};

/** A source's category line: its module and the data type it fetches ("Events · Events"). */
export const dataTypeOf = (module: string | undefined) => MODULE_DATA[(module ?? "jobs") as ModuleId] ?? MODULE_DATA.jobs;
