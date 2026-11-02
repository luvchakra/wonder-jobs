import type { ProgressFlow } from "@/wonderworks/listing/progress";

/** A business that isn't on WonderWorks: what the customer records after contacting it on its own page (2026-11-02). Stages are Bookings'. */
export const SERVICES_OUTSIDE: ProgressFlow = {
  intro: "Contacted them on their page or by phone? Keep track of it here, and it shows in Bookings.",
  pipeline: "Bookings",
  steps: [
    { status: "contacted", stage: "requested", label: "Contacted them", prompt: "I contacted them" },
    { status: "quote_received", stage: "quoted", label: "Got a quote", prompt: "I got a quote" },
    { status: "booked", stage: "booked", label: "Booked", prompt: "I booked them", ask: "datetime", askLabel: "When they'll come, or the job starts" },
    { status: "done", stage: "done_closed", label: "Job done", prompt: "Mark the job as done" },
  ],
  others: [{ status: "not_going_ahead", stage: "done_closed", label: "Didn't go ahead" }],
};
