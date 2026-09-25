/**
 * JobsApply operations view (spec §79–§81, §144–§146). Aggregates the sessions of recent tenants
 * into counts — providers, outcomes, failure codes, field categories, intervention and verification
 * rates. It never returns a tenant id, a job, a field label or a value: only numbers and categories.
 */
import { ADAPTERS } from "@/domain/jobs-apply/adapters";
import type { JobsApplySession } from "@/domain/jobs-apply/types";
import { listSessions, tenantsWithSessions } from "./store";

const inc = (m: Record<string, number>, k: string, by = 1) => {
  m[k] = (m[k] ?? 0) + by;
};

export interface ApplyOverview {
  tenantsSampled: number;
  sessions: number;
  byStatus: Record<string, number>;
  byMode: Record<string, number>;
  failures: Record<string, number>;
  interventionCategories: Record<string, number>;
  adapters: { id: string; name: string; status: string; sessions: number; formsDetected: number; fieldsDetected: number; fieldsFilled: number; fillFailures: number; interventions: number; submittedConfirmed: number; submissionEvidence: number }[];
  rates: { formDetected: number | null; fillSuccess: number | null; interventionPerForm: number | null; submittedConfirmed: number | null; submissionVerified: number | null; guidedFallback: number | null };
  generatedAt: string;
}

function adapterKey(s: JobsApplySession): string {
  return s.form?.provider ?? s.destination.provider ?? "generic";
}

export async function applyOverview(limitTenants = 200): Promise<ApplyOverview> {
  const tenants = await tenantsWithSessions(limitTenants);
  const all: JobsApplySession[] = [];
  for (const t of tenants) all.push(...(await listSessions(t)));
  const byStatus: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  const failures: Record<string, number> = {};
  const cats: Record<string, number> = {};
  const per = new Map<string, ApplyOverview["adapters"][number]>();
  for (const a of ADAPTERS) per.set(a.provider, { id: a.id, name: a.name, status: a.status, sessions: 0, formsDetected: 0, fieldsDetected: 0, fieldsFilled: 0, fillFailures: 0, interventions: 0, submittedConfirmed: 0, submissionEvidence: 0 });
  let started = 0;
  let detected = 0;
  let filled = 0;
  let fillable = 0;
  let interventions = 0;
  let confirmed = 0;
  let verified = 0;
  let guided = 0;
  for (const s of all) {
    inc(byStatus, s.status);
    inc(byMode, s.mode);
    if (s.failure) inc(failures, s.failure);
    for (const i of s.interventions) inc(cats, i.category);
    const row = per.get(adapterKey(s)) ?? per.get("generic")!;
    row.sessions++;
    if (s.status !== "READY" && s.status !== "CANCELLED") started++;
    if (s.mode === "guided") guided++;
    if (s.form?.fieldCount) {
      detected++;
      row.formsDetected++;
      row.fieldsDetected += s.form.fieldCount;
    }
    const f = s.fieldMappings.filter((m) => m.status === "filled").length;
    const failed = s.fieldMappings.filter((m) => m.status === "failed").length;
    row.fieldsFilled += f;
    row.fillFailures += failed;
    filled += f;
    fillable += f + failed;
    row.interventions += s.interventions.length;
    interventions += s.interventions.length;
    if (s.status === "SUBMITTED" || s.status === "TRACKED") {
      confirmed++;
      row.submittedConfirmed++;
      if (s.evidence.some((e) => e.confidence === "VERIFIED" || e.confidence === "LIKELY")) {
        verified++;
        row.submissionEvidence++;
      }
    }
  }
  const rate = (a: number, b: number) => (b ? a / b : null);
  return {
    tenantsSampled: tenants.length,
    sessions: all.length,
    byStatus,
    byMode,
    failures,
    interventionCategories: cats,
    adapters: [...per.values()],
    rates: { formDetected: rate(detected, started - guided), fillSuccess: rate(filled, fillable), interventionPerForm: rate(interventions, detected), submittedConfirmed: rate(confirmed, started), submissionVerified: rate(verified, confirmed), guidedFallback: rate(guided, started) },
    generatedAt: new Date().toISOString(),
  };
}
