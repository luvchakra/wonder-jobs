/**
 * WonderWorks' manifest types (docs/WONDERWORKS_PLATFORM.md §4): what every module describes about itself. A manifest is
 * data WonderWorks reads (the Find menu, the tabs, the module shell, JobsLake's per-module datasets); it never lists a
 * posting. The modules themselves are listed in `modules/registry.ts`, the composition root — WonderWorks imports no module.
 */

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
  /** The tint of its icon tile (docs/WONDERWORKS_PLATFORM.md section 9), so each module is recognisable while the design system stays one. */
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
}

/** A module's tabs at the module shell (/app/m/<id>). */
export const shellRoutes = (id: ModuleId) => ({ find: `/app/m/${id}`, saved: `/app/m/${id}/saved`, pipeline: `/app/m/${id}/pipeline`, you: `/app/m/${id}/you` });

/** Pipeline stages from their labels, with ids derived from the labels. */
export const stagesOf = (...labels: string[]): PipelineStage[] => labels.map((label) => ({ id: label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, ""), label }));

export const isLive = (m: ModuleManifest) => m.status === "live";
