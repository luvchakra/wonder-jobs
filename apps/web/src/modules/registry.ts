/**
 * WonderWorks' module registry (docs/WONDERWORKS_PLATFORM.md §4), the composition root: every module's manifest, read by
 * the Find menu, the tabs, the module shell and JobsLake's per-module datasets. A module is "soon" until its own step
 * ships — the shell then shows "Coming soon" and nothing else (CLAUDE.md, real data only). The manifest types live in
 * WonderWorks (`wonderstar/manifest.ts`); each live module's manifest lives in its own folder.
 */
import { shellRoutes as shell, stagesOf as stages, type ModuleId, type ModuleManifest } from "@/wonderstar/manifest";
import { jobsManifest } from "./jobs/manifest";
import { internshipsManifest } from "./internships/manifest";

export * from "@/wonderstar/manifest";

export const MODULES: readonly ModuleManifest[] = [
  jobsManifest,
  internshipsManifest,
  {
    id: "teaching",
    label: "Teaching",
    hint: "School and college teachers",
    icon: "BookOpen",
    accent: "mint",
    status: "soon",
    menuId: "teaching",
    routes: shell("teaching"),
    persona: [
      { key: "subjects", label: "Subjects", type: "list" },
      { key: "grades", label: "Grade levels", type: "list" },
      { key: "boards", label: "Boards", type: "list" },
      { key: "qualifications", label: "Qualifications", type: "list" },
    ],
    listing: [
      { key: "subject", label: "Subject", type: "text", facet: true },
      { key: "grades", label: "Grades", type: "list", facet: true },
      { key: "board", label: "Board", type: "text", facet: true },
      { key: "pay", label: "Pay", type: "money" },
    ],
    response: { verb: "apply", questions: true, states: ["applied", "demo_class", "appointed", "closed"], capability: "teaching.apply" },
    pipeline: { label: "Pipeline", icon: "LayoutList", stages: stages("Applied", "Demo class", "Appointed / Closed"), sections: ["Demo-class bookings"] },
    ownerSide: { workspace: "company" },
    trust: { reviews: "off" },
    compliance: ["minors"],
  },
  {
    id: "cofounders",
    label: "Co-founders",
    hint: "Find someone to build with",
    icon: "Handshake",
    accent: "lavender",
    status: "soon",
    menuId: "cofounders",
    routes: shell("cofounders"),
    persona: [
      { key: "role", label: "Role", type: "choice", options: ["Tech", "Business"] },
      { key: "skills", label: "Skills", type: "list" },
      { key: "commitment", label: "Commitment", type: "text" },
    ],
    listing: [],
    response: { verb: "connect", questions: false, mutual: true, states: ["interested", "mutual", "talking", "building", "passed"], capability: "cofounders.connect" },
    pipeline: { label: "Connections", icon: "Handshake", stages: stages("Interested", "Mutual", "Talking", "Building / Passed") },
    ownerSide: { workspace: "none" },
    trust: { reviews: "off" },
  },
  {
    id: "services",
    label: "Talent & Services",
    hint: "Hire or offer a skill",
    icon: "Users",
    accent: "lightblue",
    status: "soon",
    menuId: "talent_services",
    routes: shell("services"),
    persona: [
      { key: "skills", label: "Skills", type: "list" },
      { key: "rate", label: "Rate", type: "money" },
      { key: "area", label: "Service area", type: "text" },
    ],
    listing: [
      { key: "service", label: "Service", type: "text", facet: true },
      { key: "price", label: "Price", type: "money", facet: true },
      { key: "area", label: "Area", type: "text", facet: true },
    ],
    response: { verb: "request_quote", questions: true, states: ["requested", "quoted", "booked", "done", "paid", "reviewed"], capability: "services.request_quote" },
    pipeline: { label: "Bookings", icon: "CalendarCheck", stages: stages("Requested", "Quoted", "Booked", "Done", "Reviewed"), sections: ["Payments and receipts"] },
    ownerSide: { workspace: "person" },
    trust: { reviews: "after_done" },
    money: { kind: "escrow", currency: "INR" },
    compliance: ["payments"],
  },
  {
    id: "therapists",
    label: "Therapists",
    hint: "Licensed counsellors near you",
    icon: "HeartPulse",
    accent: "lavender",
    status: "soon",
    menuId: "therapists",
    routes: shell("therapists"),
    persona: [
      { key: "languages", label: "Languages", type: "list" },
      { key: "mode", label: "Mode", type: "choice", options: ["Online", "In person"] },
    ],
    listing: [
      { key: "licence", label: "Licence", type: "text" },
      { key: "specialties", label: "Specialties", type: "list", facet: true },
      { key: "fee", label: "Fee", type: "money", facet: true },
    ],
    response: { verb: "book", questions: false, states: ["requested", "confirmed", "held", "cancelled"], capability: "therapists.book" },
    pipeline: { label: "Sessions", icon: "CalendarClock", stages: stages("Requested", "Confirmed", "Upcoming", "Held / Cancelled"), sections: ["Crisis resources"] },
    ownerSide: { workspace: "person" },
    trust: { reviews: "off" },
    money: { kind: "fee_display", currency: "INR" },
    compliance: ["health_data"],
  },
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


