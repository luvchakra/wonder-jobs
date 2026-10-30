import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** A pro's own page (components/ServicePage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/services/listing/${encodeURIComponent(id)}`;

/**
 * Talent & Services' manifest (docs/WONDERWORKS_PLATFORM.md §4, step 7). Two lanes: local, visit-based services and
 * remote project work. No money moves through WonderWorks in v1 (owner, 2026-10-30): the pro and the client each mark a
 * job paid, so there is no escrow and no payments compliance to carry.
 */
export const servicesManifest: ModuleManifest = {
  id: "services",
  label: "Talent & Services",
  hint: "Hire or offer a skill",
  icon: "Users",
  accent: "lightblue",
  status: "live",
  menuId: "talent_services",
  routes: shellRoutes("services"),
  persona: [{ key: "area", label: "Your city or pin code", type: "text" }],
  listing: [
    { key: "category", label: "Service", type: "choice", facet: true },
    { key: "lane", label: "At your place or remote", type: "choice", options: ["At your place", "Remote project"], facet: true },
    { key: "price", label: "Price", type: "money" },
    { key: "areas", label: "Areas served", type: "list" },
    { key: "warranty", label: "Warranty", type: "number" },
  ],
  response: { verb: "request_quote", questions: true, states: ["requested", "quoted", "booked", "done", "paid", "reviewed"], capability: "services.request_quote" },
  pipeline: { label: "Bookings", icon: "CalendarCheck", stages: stagesOf("Requested", "Quoted", "Booked", "Done / Closed") },
  ownerSide: { workspace: "person" },
  trust: { reviews: "after_done" },
  money: { kind: "none", currency: "INR" },
};
