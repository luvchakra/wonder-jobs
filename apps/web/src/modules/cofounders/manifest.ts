import { shellRoutes, type ModuleManifest } from "@/wonderworks/manifest";
import { STAGES_OF } from "./domain";

/** A person's or a team's own page (components/CofounderPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/cofounders/listing/${encodeURIComponent(id)}`;

/**
 * Co-founders' manifest (docs/WONDERWORKS_PLATFORM.md §4, step 10). The listings are people and teams; there is no
 * outside source. A connection is made only when interest is mutual (`mutual`), and a person can ask to join a team of
 * founders as well as connect with another person. Its Pipeline tab is Connections.
 */
export const cofoundersManifest: ModuleManifest = {
  id: "cofounders",
  label: "Co-founders",
  hint: "Find someone to build with",
  icon: "Handshake",
  accent: "lavender",
  status: "live",
  menuId: "cofounders",
  routes: shellRoutes("cofounders"),
  persona: [
    { key: "role", label: "Role", type: "choice", options: ["Tech", "Business"] },
    { key: "skills", label: "Skills", type: "list" },
    { key: "commitment", label: "Commitment", type: "choice", options: ["Full time", "Part time", "Weekends"] },
  ],
  listing: [
    { key: "kind", label: "A person or a team", type: "choice", options: ["Person", "Team"], facet: true },
    { key: "role", label: "Role", type: "choice", options: ["Tech", "Business"], facet: true },
    { key: "skills", label: "Skills", type: "list", facet: true },
    { key: "commitment", label: "Commitment", type: "choice", options: ["Full time", "Part time", "Weekends"], facet: true },
    { key: "idea", label: "Idea", type: "text" },
    { key: "stage", label: "Stage", type: "choice", options: ["Idea", "Prototype", "Launched", "Revenue"] },
  ],
  response: { verb: "connect", questions: false, mutual: true, states: ["interested", "mutual", "talking", "building", "passed"], capability: "cofounders.connect" },
  pipeline: { label: "Connections", icon: "Handshake", stages: STAGES_OF },
  ownerSide: { workspace: "person" },
  trust: { reviews: "off" },
};
