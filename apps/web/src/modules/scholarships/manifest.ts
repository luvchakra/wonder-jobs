import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** A scholarship's or project's own page (components/ScholarshipPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/scholarships/listing/${encodeURIComponent(id)}`;

/**
 * Scholarships & Projects' manifest (owner, 2026-11-01; docs/WONDERWORKS_PLATFORM.md §4). Students, at school or
 * college, find published scholarships and projects. Its Pipeline tab is Applications: Saved → Preparing → Applied →
 * Shortlisted → Awarded / Selected → Completed, or Not selected, with a Deadlines view.
 */
export const scholarshipsManifest: ModuleManifest = {
  id: "scholarships",
  label: "Scholarships & Projects",
  hint: "Scholarships and student projects",
  icon: "Award",
  accent: "mint",
  status: "soon",
  menuId: "scholarships",
  routes: shellRoutes("scholarships"),
  persona: [
    { key: "level", label: "Level", type: "choice", options: ["Class 9–12", "Undergraduate", "Postgraduate", "PhD"] },
    { key: "field", label: "Course or field", type: "text" },
    { key: "institution", label: "School or college", type: "text" },
    { key: "region", label: "State and country", type: "text" },
    { key: "marks", label: "Marks (%)", type: "number" },
    // Optional and opt-in only: used only to match, never inferred, never sent to a provider without consent.
    { key: "incomeBand", label: "Family income a year (optional)", type: "money" },
    { key: "gender", label: "Gender (optional)", type: "choice", options: ["Female", "Male", "Another gender"] },
    { key: "category", label: "Category (optional)", type: "choice", options: ["SC", "ST", "OBC", "EWS", "Minority", "Person with disability"] },
  ],
  listing: [
    { key: "kind", label: "Scholarship or project", type: "choice", options: ["Scholarship", "Project"], facet: true },
    { key: "levels", label: "Level", type: "list", options: ["Class 9–12", "Undergraduate", "Postgraduate", "PhD"], facet: true },
    { key: "field", label: "Field", type: "text", facet: true },
    { key: "deadline", label: "Deadline", type: "date", facet: true },
    { key: "award", label: "Award", type: "money", facet: true },
    { key: "region", label: "Region", type: "text", facet: true },
    { key: "workMode", label: "Remote or on-site", type: "choice", options: ["Remote", "Hybrid", "On-site"], facet: true },
    { key: "stipend", label: "Stipend a month", type: "money", facet: true },
    { key: "documents", label: "Documents", type: "list" },
    { key: "officialUrl", label: "Official link", type: "text" },
  ],
  response: { verb: "apply", questions: true, states: ["applied", "shortlisted", "accepted", "done", "declined", "withdrawn"], capability: "scholarships.apply" },
  pipeline: { label: "Applications", icon: "LayoutList", stages: stagesOf("Saved", "Preparing", "Applied", "Shortlisted", "Awarded / Selected", "Completed"), sections: ["Deadlines"] },
  ownerSide: { workspace: "company" },
  trust: { reviews: "off" },
  money: { kind: "none", currency: "INR" },
  compliance: ["minors"],
};
