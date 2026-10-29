"use client";
import { useState } from "react";
import type { ModuleId } from "./registry";
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
