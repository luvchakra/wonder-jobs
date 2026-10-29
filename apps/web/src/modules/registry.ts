/**
 * WonderStar's module registry (docs/WONDERSTAR_PLATFORM.md §4): one manifest per module, read by the Find
 * dropdown, the module shell at /app/m/[module] and JobsLake's per-module datasets. A manifest is data the core
 * reads; it never lists a posting. A module is "soon" until its own step ships — the shell then shows "Coming
 * soon" and nothing else (CLAUDE.md, real data only).
 *
 * Jobs' manifest describes the app that exists today and only points at today's routes; nothing here changes it.
 */
import { complianceProblems } from "@/platform/compliance";

export const MODULE_IDS = ["jobs", "internships", "teaching", "cofounders", "services", "therapists", "events", "marketplace"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

/** The kind ids the Find dropdown and Admin → Settings → Menus → Find menu already use (kept, so saved menu settings still apply). */
export type UpcomingKindId = "internships" | "teaching" | "cofounders" | "talent_services" | "therapists" | "events_social" | "buy_sell_rent";

export type ModuleStatus = "live" | "soon";
export type ModuleTint = "lavender" | "lightblue" | "peach" | "mint" | "pink";
export type ModuleIcon = "Briefcase" | "GraduationCap" | "BookOpen" | "Handshake" | "Users" | "HeartPulse" | "CalendarDays" | "Store";
export type ResponseVerb = "apply" | "request_quote" | "book" | "rsvp" | "offer" | "connect";

/** One field a module adds to a profile (persona) or a listing (attrs). `facet`: offered as a Find filter. */
export interface FieldSchema {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "date" | "choice" | "list";
  options?: string[];
  facet?: boolean;
}

export interface PipelineStage {
  id: string;
  label: string;
}

export interface ModuleManifest {
  id: ModuleId;
  label: string;
  /** The Find dropdown's subtitle. */
  hint: string;
  /** A lucide icon name (platform/brand/tiles.ts draws it). */
  icon: ModuleIcon;
  /** The tint of its icon tile (docs/WONDERSTAR_PLATFORM.md section 9), so each module is recognisable while the design system stays one. */
  accent: ModuleTint;
  status: ModuleStatus;
  /** Its id in the Find dropdown's "Coming soon" group (MENUS.find_kinds). */
  menuId?: UpcomingKindId;
  /** Where its four tabs live. Jobs: today's routes. Every other module: the shell at /app/m/[id]. */
  routes: { find: string; saved: string; pipeline: string; you: string };
  persona: FieldSchema[];
  listing: FieldSchema[];
  response: {
    verb: ResponseVerb;
    /** Owners may ask screening questions. */
    questions: boolean;
    /** Both sides must say yes before contact (co-founders). */
    mutual?: boolean;
    states: string[];
    /** Namespaced capability, resolved through domain/automation/policy.ts::resolveCapability. */
    capability: string;
  };
  /** The one tab a module shapes (§4.1); Find, Saved and You are the platform's. */
  pipeline: { label: string; icon: string; stages: PipelineStage[]; sections?: string[] };
  ownerSide: { workspace: "company" | "person" | "none" };
  trust: { reviews: "off" | "after_done" | "both_sides" };
  money?: { kind: "none" | "fee_display" | "booking_payment" | "escrow"; currency: string };
  compliance?: ("health_data" | "minors" | "payments" | "housing")[];
  /** What the module does to answer its compliance flags (platform/compliance.ts checks these before it may be live). */
  safeguards?: string[];
}

const shell = (id: ModuleId) => ({ find: `/app/m/${id}`, saved: `/app/m/${id}/saved`, pipeline: `/app/m/${id}/pipeline`, you: `/app/m/${id}/you` });
const stages = (...labels: string[]): PipelineStage[] => labels.map((label) => ({ id: label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, ""), label }));

export const MODULES: readonly ModuleManifest[] = [
  {
    id: "jobs",
    label: "Jobs",
    hint: "Full-time and part-time roles",
    icon: "Briefcase",
    accent: "lavender",
    status: "live",
    routes: { find: "/app/jobs", saved: "/app/saved", pipeline: "/app/applications", you: "/app/you" },
    persona: [
      { key: "careerDna", label: "Career Profile", type: "text" },
      { key: "resume", label: "Résumé", type: "text" },
    ],
    listing: [
      { key: "salary", label: "Salary", type: "money", facet: true },
      { key: "workMode", label: "Work mode", type: "choice", options: ["Remote", "Hybrid", "On-site"], facet: true },
      { key: "jobType", label: "Job type", type: "choice", facet: true },
      { key: "skills", label: "Skills", type: "list" },
    ],
    response: { verb: "apply", questions: true, states: ["new", "reviewing", "interview", "offer", "hired", "declined"], capability: "easy_apply" },
    pipeline: { label: "Pipeline", icon: "LayoutList", stages: stages("Saved to apply", "Applied", "Interview", "Offer", "Hired / Closed"), sections: ["Calendar", "Insights", "Interview prep"] },
    ownerSide: { workspace: "company" },
    trust: { reviews: "off" },
  },
  {
    id: "internships",
    label: "Internships",
    hint: "Student roles and co-ops",
    icon: "GraduationCap",
    accent: "peach",
    status: "live",
    menuId: "internships",
    routes: shell("internships"),
    persona: [
      { key: "college", label: "College", type: "text" },
      { key: "course", label: "Course", type: "text" },
      { key: "graduationYear", label: "Graduation year", type: "number" },
      { key: "availability", label: "Available (from–to)", type: "date" },
    ],
    listing: [
      { key: "stipend", label: "Stipend a month", type: "money", facet: true },
      { key: "durationMonths", label: "Duration (months)", type: "number", facet: true },
      { key: "startsOn", label: "Start date", type: "date", facet: true },
      { key: "applyBy", label: "Apply by", type: "date" },
      { key: "schedule", label: "Part or full time", type: "choice", options: ["Part time", "Full time"] },
      { key: "workMode", label: "Remote, hybrid or on-site", type: "choice", options: ["Remote", "Hybrid", "On-site"], facet: true },
    ],
    response: { verb: "apply", questions: false, states: ["applied", "shortlisted", "offer", "accepted", "closed", "withdrawn"], capability: "internships.apply" },
    pipeline: { label: "Pipeline", icon: "LayoutList", stages: stages("Applied", "Shortlisted", "Offer", "Accepted / Closed"), sections: ["Deadlines"] },
    ownerSide: { workspace: "company" },
    trust: { reviews: "off" },
  },
  {
    id: "teaching",
    label: "Teaching",
    hint: "School and college teachers",
    icon: "BookOpen",
    accent: "mint",
    status: "live",
    menuId: "teaching",
    routes: shell("teaching"),
    persona: [
      { key: "subjects", label: "Subjects", type: "list" },
      { key: "grades", label: "Grade levels", type: "list" },
      { key: "boards", label: "Boards", type: "list" },
      { key: "qualifications", label: "Qualifications", type: "list" },
      { key: "backgroundCheck", label: "Background check", type: "choice", options: ["Yes", "No"] },
    ],
    listing: [
      { key: "subject", label: "Subject", type: "text" },
      { key: "grades", label: "Grades", type: "list", facet: true },
      { key: "board", label: "Board", type: "choice", facet: true },
      { key: "schoolType", label: "Institution", type: "choice" },
      { key: "pay", label: "Pay a month", type: "money", facet: true },
      { key: "workMode", label: "Online, hybrid or on-site", type: "choice", facet: true },
    ],
    response: { verb: "apply", questions: false, states: ["applied", "demo_class", "appointed", "closed", "withdrawn"], capability: "teaching.apply" },
    pipeline: { label: "Pipeline", icon: "LayoutList", stages: stages("Applied", "Demo class", "Appointed / Closed"), sections: ["Demo-class bookings"] },
    ownerSide: { workspace: "company" },
    trust: { reviews: "off" },
    compliance: ["minors"],
    safeguards: ["organisation_owners_only", "background_check_disclosed"],
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

/** Live: switched on, and every compliance flag it carries is answered (platform/compliance.ts); otherwise it shows Coming soon. */
export const isLive = (m: ModuleManifest) => m.status === "live" && complianceProblems(m).length === 0;
