import type { ProgressFlow } from "@/wonderworks/listing/progress";
import { OUTSIDE_LABEL as L, OUTSIDE_STAGE as S } from "./domain";

/** An internship applied for on its own site: what the student records from Applied to an offer (2026-11-02). */
export const INTERNSHIPS_OUTSIDE: ProgressFlow = {
  intro: "Applied on their site? Mark it, then keep track of what happens next in Applications.",
  pipeline: "Applications",
  steps: [
    { status: "applied", stage: S.applied, label: L.applied, prompt: "Mark as applied" },
    { status: "shortlisted", stage: S.shortlisted, label: L.shortlisted, prompt: "I was shortlisted", ask: "datetime", askLabel: "Interview time (if set)" },
    { status: "offer", stage: S.offer, label: L.offer, prompt: "I got an offer" },
  ],
  others: [
    { status: "not_selected", stage: S.not_selected, label: L.not_selected },
    { status: "withdrawn", stage: S.withdrawn, label: L.withdrawn, prompt: "I withdrew" },
  ],
};
