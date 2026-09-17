import { STAGE_KEYS } from "./stages";
import type { Provenance, WorkflowRun } from "./types";

/** Resolve a value the way the engine does: user overrides → stage outputs → inputs → config. */
export function resolveRunValue(run: WorkflowRun, key: string): { value: unknown; provenance: Provenance | null; source: "override" | "output" | "input" | "config" | null } {
  const o = run.overrides.find((x) => x.key === key);
  if (o) return { value: o.value, provenance: o.provenance, source: "override" };
  for (const k of [...STAGE_KEYS].reverse()) {
    const out = run.outputs[k];
    if (out && key in out.data) return { value: out.data[key], provenance: out.provenance, source: "output" };
  }
  const i = run.inputs.find((x) => x.key === key);
  if (i) return { value: i.value, provenance: i.provenance, source: "input" };
  const cfg = run.config as unknown as Record<string, unknown>;
  if (key in cfg) return { value: cfg[key], provenance: "USER_PROVIDED", source: "config" };
  return { value: undefined, provenance: null, source: null };
}

export const PROVENANCE_META: Record<Provenance, { label: string; tone: "brand" | "success" | "info" | "neutral" }> = {
  AI_GENERATED: { label: "AI-generated", tone: "brand" },
  USER_PROVIDED: { label: "User-provided", tone: "success" },
  USER_MODIFIED: { label: "User-modified", tone: "success" },
  SYSTEM_DERIVED: { label: "System-derived", tone: "neutral" },
};

/** Inputs the user may inspect/override per stage (spec §10). */
export interface EditableInput {
  key: string;
  label: string;
  stage: (typeof STAGE_KEYS)[number];
  kind: "text" | "list" | "number";
  hint?: string;
}

export const EDITABLE_INPUTS: EditableInput[] = [
  { key: "careerGoal", label: "Career goal", stage: "profile", kind: "text" },
  { key: "preferredLocations", label: "Preferred locations", stage: "profile", kind: "list", hint: "Comma-separated, e.g. Mumbai, Bengaluru, Remote" },
  { key: "minSalary", label: "Minimum salary (annual, ₹)", stage: "profile", kind: "number" },
  { key: "minMatchThreshold", label: "Minimum match score", stage: "rank", kind: "number", hint: "Roles below this score are left out of the shortlist" },
];
