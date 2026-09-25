/**
 * JobsApply gates (spec §65–§67). Pure functions; the server evaluates them before handing the
 * helper anything to fill.
 *
 *  - `fillDecision` is `resolveCapability("fill_application", …)` — the single deterministic gate
 *    (CLAUDE.md). A missing policy or level fails closed to "ask".
 *  - `fillGate` is the §66 checklist for one fill request.
 *  - There is deliberately no submit gate: no code path submits, so there is nothing to allow.
 */
import { resolveCapability, type AutomationLevel, type AutomationPolicy } from "@/domain/automation/policy";
import { checkDomain } from "./destination";
import { FILLABLE } from "./states";
import type { FieldMapping, JobsApplySession } from "./types";

export type FillDecision = "run" | "ask" | "skip";

/** How the helper may fill: automatically on detection ("run"), after the candidate's click ("ask"), or not at all ("skip" → guided). */
export function fillDecision(policy: Partial<AutomationPolicy> | undefined, level: AutomationLevel | undefined): FillDecision {
  if (!policy || !level) return "ask";
  if (!policy.fill_application) return "ask";
  return resolveCapability("fill_application", policy as AutomationPolicy, level);
}

/**
 * The candidate's per-application choice (§12 "How much should Wonder do?") can only narrow the policy,
 * never widen it: "Guide me" never fills, "Fill forms for me" always waits for the click, and
 * "Work more independently" fills on detection only where the policy itself says "run".
 */
export function effectiveFill(decision: FillDecision, mode: "guided" | "assisted" | "fill"): FillDecision {
  if (decision === "skip" || mode === "guided") return "skip";
  if (mode === "assisted") return "ask";
  return decision;
}

/** Opening the employer's page is the existing hand-off capability (`submit_application`, "Hand off application"). */
export function handoffDecision(policy: Partial<AutomationPolicy> | undefined, level: AutomationLevel | undefined): FillDecision {
  if (!policy || !level || !policy.submit_application) return "ask";
  return resolveCapability("submit_application", policy as AutomationPolicy, level);
}

export type GateResult = { ok: true; mappings: FieldMapping[] } | { ok: false; reason: string };

/**
 * §66 Browser fill safety gate, evaluated per request:
 *  ✓ destination matches the expected domain (or one the candidate approved)
 *  ✓ the session belongs to the candidate (the caller checked the token's tenant + session)
 *  ✓ an Application Pack is selected
 *  ✓ no sensitive field is filled
 *  ✓ the candidate authorised the fill (policy "run", or an explicit click under "ask")
 */
export function fillGate(s: JobsApplySession, input: { host: string; decision: FillDecision; candidateClicked: boolean; fieldIds?: string[] }): GateResult {
  if (s.stopped) return { ok: false, reason: "You stopped this application." };
  if (!FILLABLE.has(s.status)) return { ok: false, reason: `Filling isn't possible while the application is “${s.status.toLowerCase()}”.` };
  const verdict = checkDomain(input.host, s.destination, s.approvedDomains);
  if (verdict === "unexpected" || verdict === "sso") return { ok: false, reason: "This page isn't the application's destination." };
  if (!s.pack?.version) return { ok: false, reason: "No Application Pack is selected." };
  if (input.decision === "skip") return { ok: false, reason: "Filling forms is turned off in What Wonder can do — use guided mode." };
  if (input.decision === "ask" && !input.candidateClicked) return { ok: false, reason: "Waiting for you to choose Fill." };
  const wanted = input.fieldIds ? new Set(input.fieldIds) : null;
  const mappings = s.fieldMappings.filter(
    (m) =>
      (!wanted || wanted.has(m.fieldId)) &&
      m.classification !== "human-only" &&
      (m.status === "pending" || m.status === "confirmed" || m.status === "failed") &&
      (m.value !== undefined || !!m.file) &&
      // Only SAFE+HIGH fills without review; anything else must have been confirmed by the candidate.
      ((m.classification === "safe" && m.confidence === "HIGH") || m.status === "confirmed"),
  );
  return { ok: true, mappings };
}
