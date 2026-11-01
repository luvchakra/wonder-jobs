/**
 * WonderWorks' module registry (docs/WONDERWORKS_PLATFORM.md §4), the composition root: every module's manifest, read by
 * the Find menu, the tabs, the module shell and WorksLake's per-module datasets. A module is "soon" until its own step
 * ships — the shell then shows "Coming soon" and nothing else (CLAUDE.md, real data only). The manifest types live in
 * WonderWorks (`wonderworks/manifest.ts`); each live module's manifest lives in its own folder.
 */
import type { ModuleId, ModuleManifest } from "@/wonderworks/manifest";
import { jobsManifest } from "./jobs/manifest";
import { internshipsManifest } from "./internships/manifest";
import { teachingManifest } from "./teaching/manifest";
import { servicesManifest } from "./services/manifest";
import { therapistsManifest } from "./therapists/manifest";
import { cofoundersManifest } from "./cofounders/manifest";
import { eventsManifest } from "./events/manifest";
import { marketplaceManifest } from "./marketplace/manifest";
import { scholarshipsManifest } from "./scholarships/manifest";

export * from "@/wonderworks/manifest";

export const MODULES: readonly ModuleManifest[] = [
  jobsManifest,
  internshipsManifest,
  teachingManifest,
  cofoundersManifest,
  servicesManifest,
  therapistsManifest,
  eventsManifest,
  marketplaceManifest,
  scholarshipsManifest,
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export const isModuleId = (v: unknown): v is ModuleId => typeof v === "string" && BY_ID.has(v as ModuleId);

/** The manifest for an id, or undefined for anything the registry doesn't know. */
export function moduleById(id: string): ModuleManifest | undefined {
  return isModuleId(id) ? BY_ID.get(id) : undefined;
}


