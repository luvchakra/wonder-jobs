import type { ProgressFlow } from "@/wonderworks/listing/progress";
import { OUTSIDE_LABEL as L, OUTSIDE_STAGE as S } from "./domain";

/** A teaching post applied for on the school's own site: what the teacher records from Applied to appointed (2026-11-02). */
export const TEACHING_OUTSIDE: ProgressFlow = {
  intro: "Applied on the school's site? Mark it, then keep track of what happens next in Pipeline.",
  pipeline: "Pipeline",
  steps: [
    { status: "applied", stage: S.applied, label: L.applied, prompt: "Mark as applied" },
    { status: "in_process", stage: S.in_process, label: L.in_process, prompt: "I have an interview or demo class", ask: "datetime", askLabel: "When" },
    { status: "appointed", stage: S.appointed, label: L.appointed, prompt: "I was appointed" },
  ],
  others: [
    { status: "not_selected", stage: S.not_selected, label: L.not_selected },
    { status: "withdrawn", stage: S.withdrawn, label: L.withdrawn, prompt: "I withdrew" },
  ],
};
