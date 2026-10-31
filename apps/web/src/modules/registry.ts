/**
 * WonderWorks' module registry (docs/WONDERWORKS_PLATFORM.md §4), the composition root: every module's manifest, read by
 * the Find menu, the tabs, the module shell and WorksLake's per-module datasets. A module is "soon" until its own step
 * ships — the shell then shows "Coming soon" and nothing else (CLAUDE.md, real data only). The manifest types live in
 * WonderWorks (`wonderworks/manifest.ts`); each live module's manifest lives in its own folder.
 */
import { shellRoutes as shell, stagesOf as stages, type ModuleId, type ModuleManifest } from "@/wonderworks/manifest";
import { jobsManifest } from "./jobs/manifest";
import { internshipsManifest } from "./internships/manifest";
import { teachingManifest } from "./teaching/manifest";
import { servicesManifest } from "./services/manifest";
import { therapistsManifest } from "./therapists/manifest";
import { cofoundersManifest } from "./cofounders/manifest";

export * from "@/wonderworks/manifest";

export const MODULES: readonly ModuleManifest[] = [
  jobsManifest,
  internshipsManifest,
  teachingManifest,
  cofoundersManifest,
  servicesManifest,
  therapistsManifest,
  {
    id: "events",
    label: "Events & Social",
    hint: "Meetups and things to do",
    icon: "CalendarDays",
    accent: "pink",
    status: "soon",
    menuId: "events_social",
    routes: shell("events"),
    persona: [
      { key: "interests", label: "Interests", type: "list" },
      { key: "city", label: "City", type: "text" },
    ],
    listing: [
      { key: "startsAt", label: "When", type: "date", facet: true },
      { key: "place", label: "Where", type: "text", facet: true },
      { key: "capacity", label: "Capacity", type: "number" },
      { key: "price", label: "Price", type: "money", facet: true },
    ],
    response: { verb: "rsvp", questions: false, states: ["going", "waitlist", "attended", "no_show"], capability: "events.rsvp" },
    pipeline: { label: "My events", icon: "CalendarHeart", stages: stages("Going", "Waitlist", "Attended"), sections: ["Calendar"] },
    ownerSide: { workspace: "person" },
    trust: { reviews: "off" },
    compliance: ["minors"],
  },
  {
    id: "marketplace",
    label: "Buy, Sell & Rent",
    hint: "Pre-used items",
    icon: "Store",
    accent: "peach",
    status: "soon",
    menuId: "buy_sell_rent",
    routes: shell("marketplace"),
    persona: [{ key: "area", label: "Area", type: "text" }],
    listing: [
      { key: "category", label: "Category", type: "text", facet: true },
      { key: "price", label: "Price", type: "money", facet: true },
      { key: "condition", label: "Condition", type: "choice", options: ["New", "Like new", "Used"], facet: true },
    ],
    response: { verb: "offer", questions: false, states: ["messaged", "offer", "visit", "done"], capability: "marketplace.offer" },
    pipeline: { label: "Deals", icon: "Handshake", stages: stages("Messaged", "Offer", "Visit", "Done"), sections: ["My listings"] },
    ownerSide: { workspace: "person" },
    trust: { reviews: "off" },
    compliance: ["payments", "housing"],
  },
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export const isModuleId = (v: unknown): v is ModuleId => typeof v === "string" && BY_ID.has(v as ModuleId);

/** The manifest for an id, or undefined for anything the registry doesn't know. */
export function moduleById(id: string): ModuleManifest | undefined {
  return isModuleId(id) ? BY_ID.get(id) : undefined;
}


