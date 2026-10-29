"use client";
import { useState } from "react";
import type { ModuleId } from "./registry";
import { InternshipCard, InternshipSheet } from "./internships/components/Listing";
import type { InternshipListing } from "./internships/domain";
import { TeachingCard, TeachingSheet } from "./teaching/components/Listing";
import type { TeachingListing } from "./teaching/domain";

/** How each live module shows a saved listing in the platform's Saved (docs/WONDERSTAR_PLATFORM.md §4.1): its own card. */
export function SavedCard({ module, item }: { module: Exclude<ModuleId, "jobs">; item: unknown }) {
  const [open, setOpen] = useState(false);
  if (module === "internships") {
    const l = item as InternshipListing;
    return (
      <>
        <InternshipCard listing={l} onOpen={() => setOpen(true)} />
        {open && <InternshipSheet listing={l} onClose={() => setOpen(false)} />}
      </>
    );
  }
  if (module === "teaching") {
    const l = item as TeachingListing;
    return (
      <>
        <TeachingCard listing={l} onOpen={() => setOpen(true)} />
        {open && <TeachingSheet listing={l} onClose={() => setOpen(false)} />}
      </>
    );
  }
  return null;
}
