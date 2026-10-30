import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** A practitioner's own page (components/TherapistPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/therapists/listing/${encodeURIComponent(id)}`;

/**
 * Therapists' manifest (docs/WONDERWORKS_PLATFORM.md §4, step 11). A pro-listed directory with no clinical data: the
 * practitioner's own words about how they work, their languages, focus areas and fee. WonderWorks verifies no licence
 * and shows no rating; the owner's legal review decides those (tracker, Therapists). Sessions: sessions.ts.
 */
export const therapistsManifest: ModuleManifest = {
  id: "therapists",
  label: "Therapists",
  hint: "Counsellors near you or online",
  icon: "HeartPulse",
  accent: "lavender",
  status: "live",
  menuId: "therapists",
  routes: shellRoutes("therapists"),
  persona: [
    { key: "languages", label: "Languages", type: "list" },
    { key: "mode", label: "Mode", type: "choice", options: ["Online", "In person"] },
    { key: "budget", label: "Budget per session", type: "money" },
  ],
  listing: [
    { key: "modes", label: "Online or in person", type: "choice", options: ["Online", "In person"], facet: true },
    { key: "languages", label: "Languages", type: "list", facet: true },
    { key: "focus", label: "Focus areas", type: "list", facet: true },
    { key: "fee", label: "Fee", type: "money", facet: true },
  ],
  response: { verb: "book", questions: false, states: ["requested", "confirmed", "held", "cancelled"], capability: "therapists.book" },
  pipeline: { label: "Sessions", icon: "CalendarClock", stages: stagesOf("Requested", "Upcoming", "Held / Closed") },
  ownerSide: { workspace: "person" },
  trust: { reviews: "off" },
  money: { kind: "fee_display", currency: "INR" },
  compliance: ["health_data"],
};
