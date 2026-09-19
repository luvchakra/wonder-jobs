/**
 * Finding the tenants the cron has work for.
 *
 * Preferably the database answers this directly (migration 0004): the alternative is pulling every
 * tenant's whole workflow document — runs, stages, events — across the wire to read a few timestamps.
 * The fallback exists for deployments where that migration hasn't been applied yet, and for local
 * development against the in-memory store.
 */
import { getSupabaseAdmin } from "@/server/supabase";
import { readClientState } from "@/server/clientState";
import { stateStore } from "@/server/state";
import { isDue } from "@/domain/workflow/schedule";
import type { WorkflowSchedule } from "@/domain/workflow/types";

/** False once `due_schedule_tenants` is known to be missing, so we stop paying for the round trip. */
let rpcAvailable = true;

export async function listTenantsWithDueSchedules(now: Date, limit = 200): Promise<string[]> {
  const sb = getSupabaseAdmin();
  if (sb && rpcAvailable) {
    const { data, error } = await sb.rpc("due_schedule_tenants", { p_now: now.toISOString(), p_limit: limit });
    if (!error) return (data ?? []).map((r: { tenant_id: string }) => r.tenant_id);
    // PGRST202 = function not in the schema cache; anything else is a real failure worth surfacing.
    if (error.code !== "PGRST202" && !/due_schedule_tenants/.test(error.message)) throw new Error(`Could not find due schedules: ${error.message}`);
    rpcAvailable = false;
  }
  const tenants = await stateStore.listTenants("wj.workflow", limit);
  const out: string[] = [];
  for (const tenantId of tenants) {
    const doc = await readClientState<{ schedules?: Record<string, WorkflowSchedule> }>(tenantId, "wj.workflow");
    if (hasDueSchedule(doc?.schedules, now)) out.push(tenantId);
  }
  return out;
}

export function hasDueSchedule(schedules: Record<string, WorkflowSchedule> | undefined, now: Date): boolean {
  return Object.values(schedules ?? {}).some((s) => s && isDue(s, now));
}
