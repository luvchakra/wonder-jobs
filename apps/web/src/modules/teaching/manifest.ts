import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** A teaching opening's own page (components/TeachingPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/teaching/listing/${encodeURIComponent(id)}`;

/** Teaching's manifest (docs/WONDERWORKS_PLATFORM.md §4, step 6). Its Pipeline tab keeps the name Pipeline. */
export const teachingManifest: ModuleManifest = {
  id: "teaching",
  label: "Teaching",
  hint: "School and college teachers",
  icon: "BookOpen",
  accent: "mint",
  status: "live",
  menuId: "teaching",
  routes: shellRoutes("teaching"),
  persona: [
    { key: "subjects", label: "Subjects", type: "list" },
    { key: "grades", label: "Grade levels", type: "list" },
    { key: "boards", label: "Boards", type: "list" },
    { key: "qualifications", label: "Qualifications", type: "list" },
    { key: "languages", label: "Languages", type: "list" },
  ],
  listing: [
    { key: "subject", label: "Subject", type: "text", facet: true },
    { key: "grades", label: "Grades", type: "list", facet: true },
    { key: "boards", label: "Board", type: "list", facet: true },
    { key: "hours", label: "Full time, part time or tuition", type: "choice", options: ["Full time", "Part time", "Tuition"], facet: true },
    { key: "pay", label: "Pay", type: "money" },
  ],
  response: { verb: "apply", questions: true, states: ["applied", "demo_class", "appointed", "closed"], capability: "teaching.apply" },
  pipeline: { label: "Pipeline", icon: "LayoutList", stages: stagesOf("Preparing", "Applied", "Demo class", "Appointed / Closed"), sections: ["Demo-class bookings"] },
  ownerSide: { workspace: "company" },
  trust: { reviews: "off" },
  compliance: ["minors"],
};
