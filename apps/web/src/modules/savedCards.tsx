"use client";
import { isLive, moduleById, MODULES, type ModuleId, type ModuleManifest } from "./registry";
import { ModuleSaved } from "@/wonderworks/shell/ModulePages";
import { InternshipCard } from "./internships/components/Listing";
import type { InternshipListing } from "./internships/domain";
import { TeachingCard } from "./teaching/components/Listing";
import type { TeachingListing } from "./teaching/domain";
import { ServiceCard } from "./services/components/Listing";
import type { ServiceListing } from "./services/domain";

const noop = () => undefined;

/** How each live module shows a saved listing in the platform's Saved (docs/WONDERWORKS_PLATFORM.md §4.1): its own Find card. */
export function SavedCard({ module, item }: { module: Exclude<ModuleId, "jobs">; item: unknown }) {
  // Its title opens the listing's own page.
  if (module === "internships") return <InternshipCard item={item as InternshipListing} onOpen={noop} />;
  if (module === "teaching") return <TeachingCard item={item as TeachingListing} onOpen={noop} />;
  if (module === "services") return <ServiceCard item={item as ServiceListing} onOpen={noop} />;
  return null;
}

/** The words Saved's box looks in, per module. */
export function savedText(module: Exclude<ModuleId, "jobs">, item: unknown): string {
  if (module === "internships") {
    const l = item as InternshipListing;
    return [l.title, l.company, l.location, ...l.skills].join(" ");
  }
  if (module === "teaching") {
    const l = item as TeachingListing;
    return [l.title, l.company, l.location, l.terms.subject ?? "", ...(l.terms.boards ?? [])].join(" ");
  }
  if (module === "services") {
    const l = item as ServiceListing;
    return [l.title, l.company, l.location, l.terms.category ?? "", ...(l.terms.skills ?? []), ...(l.terms.areas ?? [])].join(" ");
  }
  return "";
}

/** Saved at the module shell: WonderWorks' Saved with every live module's own card (the registry is the composition root). */
export function ShellSaved({ id }: { id: Exclude<ModuleId, "jobs"> }) {
  const live = MODULES.filter((m): m is ModuleManifest & { id: Exclude<ModuleId, "jobs"> } => m.id !== "jobs" && isLive(m));
  return <ModuleSaved m={moduleById(id) as ModuleManifest & { id: Exclude<ModuleId, "jobs"> }} live={live} card={(module, item) => <SavedCard module={module} item={item} />} cardText={savedText} />;
}
