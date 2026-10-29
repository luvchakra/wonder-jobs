import type { ModuleManifest } from "@/modules/registry";

/**
 * Sensitive modules' compliance flags (docs/WONDERSTAR_PLATFORM.md §7), checked by the platform before a module can be
 * switched on: a "live" module must declare, in its manifest's `safeguards`, every safeguard its flags require. Each
 * safeguard names something the module's own code does — the module's tests check that code; this only refuses a
 * flag nobody answered for.
 */
export const REQUIRED_SAFEGUARDS: Record<NonNullable<ModuleManifest["compliance"]>[number], readonly string[]> = {
  // Work with children: only organisations post (a school's hiring workspace, never a private individual), and an
  // applicant's own statement about a police verification or background check reaches the organisation with every application.
  minors: ["organisation_owners_only", "background_check_disclosed"],
  // Health data: legal review, consent and a separate store come first (Therapists).
  health_data: ["legal_review", "explicit_consent", "separate_store"],
  payments: ["payment_provider", "refund_policy"],
  housing: ["anti_scam_rules", "phone_verified_sellers"],
};

/** What a manifest still owes before it may be live; empty when nothing. */
export function complianceProblems(m: Pick<ModuleManifest, "id" | "compliance" | "safeguards">): string[] {
  const have = new Set(m.safeguards ?? []);
  return (m.compliance ?? []).flatMap((flag) => REQUIRED_SAFEGUARDS[flag].filter((s) => !have.has(s)).map((s) => `${m.id}: ${flag} needs ${s}`));
}
