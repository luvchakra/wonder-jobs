import type { ProgressFlow } from "@/wonderworks/listing/progress";

/**
 * A new startup or an outside post isn't on WonderWorks, so nobody here can be connected with (owner, 2026-11-12: give
 * new startups these options too). What the person records after reaching out on the startup's or post's own page; each
 * step lands in a Connections stage, beside their WonderWorks connections. Only what they entered is kept.
 */
export const COFOUNDERS_OUTSIDE: ProgressFlow = {
  intro: "Reached out to them on their page? Keep track of it here, and it shows in Connections.",
  pipeline: "Connections",
  steps: [
    { status: "reached_out", stage: "interested", label: "Reached out", prompt: "I reached out" },
    { status: "replied", stage: "mutual", label: "They replied", prompt: "They replied" },
    { status: "meeting", stage: "talking", label: "Meeting set", prompt: "We set up a meeting", ask: "datetime", askLabel: "When you meet" },
    { status: "joined", stage: "building_passed", label: "Building together", prompt: "We're building together" },
  ],
  others: [
    { status: "no_reply", stage: "building_passed", label: "No reply" },
    { status: "not_a_fit", stage: "building_passed", label: "Not a fit" },
  ],
};

/** The labels Connections shows for a tracked outside listing. */
export const OUTSIDE_LABEL: Record<string, string> = Object.fromEntries([...COFOUNDERS_OUTSIDE.steps, ...COFOUNDERS_OUTSIDE.others].map((s) => [s.status, s.label]));
