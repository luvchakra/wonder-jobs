/**
 * Application adapter registry (spec §40–§42, §78, §146–§148). The browser helper carries the
 * page-side half of each adapter (provider selector hints on top of the generic semantic reader);
 * this registry is the product-side record of what each one is and what it has been verified
 * against. A status is never claimed from URL detection alone (§146): it names the fixture the
 * adapter contract tests ran against, and says plainly that no live employer portal is tested.
 */
import type { AtsProvider } from "./types";

export type AdapterStatus = "SUPPORTED" | "SUPPORTED_WITH_LIMITATIONS" | "USER_ASSISTED_ONLY" | "DO_NOT_AUTOMATE" | "UNKNOWN";
export type AdapterCapability = "detect" | "inspect" | "map" | "fill" | "upload" | "multi_step" | "intervention" | "error" | "submission_detection";

export interface AdapterInfo {
  id: string;
  provider: AtsProvider | "generic";
  name: string;
  /** How applications go: always the candidate's browser — no authorized application API is configured (§61–§63). */
  method: "browser";
  status: AdapterStatus;
  capabilities: AdapterCapability[];
  /** The mock portal the contract tests use (`e2e/fixtures/portals`). */
  fixture?: string;
  /** Field-name hints the helper checks before its label reader. */
  hints: string;
  limitations: string[];
  /** Submission is always candidate-controlled; recorded here so the admin view can never show otherwise. */
  submission: "candidate_controlled";
}

const ALL: AdapterCapability[] = ["detect", "inspect", "map", "fill", "upload", "multi_step", "intervention", "error", "submission_detection"];

export const ADAPTERS: AdapterInfo[] = [
  { id: "generic-browser", provider: "generic", name: "Generic form reader", method: "browser", status: "SUPPORTED_WITH_LIMITATIONS", capabilities: ALL, fixture: "mock-generic, mock-multi-step, mock-difficult-form", hints: "Labels, aria-label, name, placeholder, autocomplete", limitations: ["Fills only fields it identifies with high confidence", "Custom widgets without labels are left for the candidate", "Cross-origin iframes can't be read"], submission: "candidate_controlled" },
  { id: "greenhouse", provider: "greenhouse", name: "Greenhouse", method: "browser", status: "SUPPORTED_WITH_LIMITATIONS", capabilities: ALL, fixture: "mock-greenhouse", hints: "#first_name, #last_name, #email, #phone, #resume, #cover_letter, job_application[answers_attributes]", limitations: ["Custom questions go through the generic reader", "Tested against a mock fixture, not live boards"], submission: "candidate_controlled" },
  { id: "lever", provider: "lever", name: "Lever", method: "browser", status: "SUPPORTED_WITH_LIMITATIONS", capabilities: ALL, fixture: "mock-lever", hints: "name, email, phone, org, urls[LinkedIn], resume, comments", limitations: ["Lever's candidate-side API is not used — it requires employer authorization (§63)", "Tested against a mock fixture, not live boards"], submission: "candidate_controlled" },
  { id: "ashby", provider: "ashby", name: "Ashby", method: "browser", status: "SUPPORTED_WITH_LIMITATIONS", capabilities: ["detect", "inspect", "map", "fill", "upload", "intervention", "error", "submission_detection"], fixture: "mock-ashby", hints: "_systemfield_name, _systemfield_email, _systemfield_resume", limitations: ["Tested against a mock fixture, not live boards"], submission: "candidate_controlled" },
  { id: "workday", provider: "workday", name: "Workday", method: "browser", status: "USER_ASSISTED_ONLY", capabilities: ["detect", "inspect", "map", "fill", "multi_step", "intervention", "error"], fixture: "mock-workday", hints: "data-automation-id (legalNameSection_firstName, email, phone-number…)", limitations: ["Needs a Workday account the candidate creates and signs in to themselves", "Multi-step: the helper fills each step as the candidate moves through", "Custom widgets often need the candidate"], submission: "candidate_controlled" },
  { id: "smartrecruiters", provider: "smartrecruiters", name: "SmartRecruiters", method: "browser", status: "USER_ASSISTED_ONLY", capabilities: ["detect", "inspect", "map", "fill", "intervention", "error"], hints: "Generic reader on SmartRecruiters' labelled fields", limitations: ["No dedicated fixture yet — generic reader only"], submission: "candidate_controlled" },
  { id: "workable", provider: "workable", name: "Workable", method: "browser", status: "USER_ASSISTED_ONLY", capabilities: ["detect", "inspect", "map", "fill", "intervention", "error"], hints: "Generic reader on Workable's labelled fields", limitations: ["No dedicated fixture yet — generic reader only"], submission: "candidate_controlled" },
];

export function adapterFor(provider: AtsProvider | undefined): AdapterInfo | undefined {
  return provider ? ADAPTERS.find((a) => a.provider === provider) : undefined;
}

export const ADAPTER_STATUS_LABEL: Record<AdapterStatus, string> = {
  SUPPORTED: "Supported",
  SUPPORTED_WITH_LIMITATIONS: "Supported with limitations",
  USER_ASSISTED_ONLY: "User-assisted only",
  DO_NOT_AUTOMATE: "Do not automate",
  UNKNOWN: "Unknown",
};
