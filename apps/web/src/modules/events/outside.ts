import type { ProgressFlow } from "@/wonderworks/listing/progress";

/** An event listed elsewhere: what the person records after registering on the organiser's page (2026-11-02). Stages are My events'. */
export const EVENTS_OUTSIDE: ProgressFlow = {
  intro: "Registered or got a ticket on the organiser's page? Keep track of it here, and it shows in My events.",
  pipeline: "My events",
  steps: [
    { status: "registered", stage: "going", label: "Going", prompt: "I registered" },
    { status: "attended", stage: "attended", label: "Attended", prompt: "Mark as attended" },
  ],
  others: [
    { status: "waitlisted", stage: "waitlist", label: "On the waitlist", prompt: "I'm on the waitlist" },
    { status: "not_going", stage: null, label: "Not going" },
  ],
};
