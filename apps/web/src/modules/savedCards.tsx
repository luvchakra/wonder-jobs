"use client";
import { useState } from "react";
import { isLive, moduleById, MODULES, type ModuleId, type ModuleManifest } from "./registry";
import { ModuleSaved } from "@/wonderstar/shell/ModulePages";
import { InternshipCard, InternshipSheet } from "./internships/components/Listing";
import type { InternshipListing } from "./internships/domain";

/** How each live module shows a saved listing in the platform's Saved (docs/WONDERSTAR_PLATFORM.md §4.1): its own Find card. */
export function SavedCard({ module, item }: { module: Exclude<ModuleId, "jobs">; item: unknown }) {
  const [open, setOpen] = useState(false);
  if (module === "internships") {
    const l = item as InternshipListing;
    return (
      <>
        <InternshipCard item={l} onOpen={() => setOpen(true)} />
        {open && <InternshipSheet item={l} onClose={() => setOpen(false)} />}
      </>
    );
  }
  return null;
}

/** The words Saved's box looks in, per module. */
export function savedText(module: Exclude<ModuleId, "jobs">, item: unknown): string {
  if (module === "internships") {
    const l = item as InternshipListing;
    return [l.title, l.company, l.location, ...l.skills].join(" ");
  }
  return "";
}

/** Saved at the module shell: WonderStar's Saved with every live module's own card (the registry is the composition root). */
export function ShellSaved({ id }: { id: Exclude<ModuleId, "jobs"> }) {
  const live = MODULES.filter((m): m is ModuleManifest & { id: Exclude<ModuleId, "jobs"> } => m.id !== "jobs" && isLive(m));
  return <ModuleSaved m={moduleById(id) as ModuleManifest & { id: Exclude<ModuleId, "jobs"> }} live={live} card={(module, item) => <SavedCard module={module} item={item} />} cardText={savedText} />;
}
