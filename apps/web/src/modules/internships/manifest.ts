import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** An internship's own page (components/InternshipPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/internships/listing/${encodeURIComponent(id)}`;

/** Internships' manifest. Its Pipeline tab is called Applications (owner, 2026-10-29). */
export const internshipsManifest: ModuleManifest = {
  id: "internships",
  label: "Internships",
  hint: "Student roles and co-ops",
  icon: "GraduationCap",
  accent: "peach",
  status: "live",
  menuId: "internships",
  routes: shellRoutes("internships"),
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
  pipeline: { label: "Applications", icon: "LayoutList", stages: stagesOf("Preparing", "Applied", "Shortlisted", "Offer", "Accepted / Closed"), sections: ["Deadlines"] },
  ownerSide: { workspace: "company" },
  trust: { reviews: "off" },
};
