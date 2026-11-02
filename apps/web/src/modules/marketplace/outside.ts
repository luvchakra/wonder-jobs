import type { ProgressFlow } from "@/wonderworks/listing/progress";

/**
 * An item a shop sells on its own site: what the buyer records after going there (2026-11-02). Nothing is bought here,
 * so these are the buyer's own notes; they land in Deals' stages (Messaged · Offer · Visit · Done).
 */
export const MARKETPLACE_OUTSIDE: ProgressFlow = {
  intro: "Asked the shop, ordered or planning a visit? Keep track of it here, and it shows in Deals.",
  pipeline: "Deals",
  steps: [
    { status: "contacted", stage: "messaged", label: "Asked the shop", prompt: "I contacted the shop" },
    { status: "ordered", stage: "offer", label: "Ordered", prompt: "I ordered it", ask: "date", askLabel: "Expected delivery (if they said)" },
    { status: "received", stage: "done", label: "Received", prompt: "Mark as received" },
  ],
  others: [
    { status: "visit_planned", stage: "visit", label: "Visiting the shop", prompt: "I'll visit the shop" },
    { status: "no_deal", stage: "done", label: "Didn't buy" },
  ],
};
