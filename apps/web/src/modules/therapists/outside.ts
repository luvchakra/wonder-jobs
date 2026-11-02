import type { ProgressFlow } from "@/wonderworks/listing/progress";

/** A practice that isn't on WonderWorks: what the client records after contacting it on its own page (2026-11-02). Stages are Sessions'. */
export const THERAPISTS_OUTSIDE: ProgressFlow = {
  intro: "Contacted them on their page or by phone? Keep track of it here, and it shows in Sessions.",
  pipeline: "Sessions",
  steps: [
    { status: "contacted", stage: "requested", label: "Contacted them", prompt: "I contacted them" },
    { status: "booked", stage: "upcoming", label: "Session booked", prompt: "I booked a session", ask: "datetime", askLabel: "Session time" },
    { status: "attended", stage: "held_closed", label: "Session held", prompt: "Mark the session as held" },
  ],
  others: [
    { status: "rebooked", stage: "upcoming", label: "Another session booked", prompt: "Book another session" },
    { status: "not_going_ahead", stage: "held_closed", label: "Didn't go ahead" },
  ],
};
