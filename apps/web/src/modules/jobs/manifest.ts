import { stagesOf, type ModuleManifest } from "@/wonderstar/manifest";

/** WonderJobs' manifest: it describes the jobs portal that exists today and only points at its routes. */
export const jobsManifest: ModuleManifest = {
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
  pipeline: { label: "Pipeline", icon: "LayoutList", stages: stagesOf("Saved to apply", "Applied", "Interview", "Offer", "Hired / Closed"), sections: ["Calendar", "Insights", "Interview prep"] },
  ownerSide: { workspace: "company" },
  trust: { reviews: "off" },
};
