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
import type { Application } from "@/domain/applications/types";
import { isDueForReminder } from "./reminders";

/** Set false once a function is known to be missing, so we stop paying for the round trip. */
const rpcAvailable: Record<string, boolean> = { due_schedule_tenants: true, due_reminder_tenants: true };

async function viaRpc(fn: string, now: Date, limit: number): Promise<string[] | null> {
  const sb = getSupabaseAdmin();
  if (!sb || !rpcAvailable[fn]) return null;
  const { data, error } = await sb.rpc(fn, { p_now: now.toISOString(), p_limit: limit });
  if (!error) return (data ?? []).map((r: { tenant_id: string }) => r.tenant_id);
  // PGRST202 = function not in the schema cache; anything else is a real failure worth surfacing.
  if (error.code !== "PGRST202" && !new RegExp(fn).test(error.message)) throw new Error(`Could not query ${fn}: ${error.message}`);
  rpcAvailable[fn] = false;
  return null;
}

export async function listTenantsWithDueSchedules(now: Date, limit = 200): Promise<string[]> {
  const viaSql = await viaRpc("due_schedule_tenants", now, limit);
  if (viaSql) return viaSql;
  const tenants = await stateStore.listTenants("wj.workflow", limit);
  const out: string[] = [];
  for (const tenantId of tenants) {
    const doc = await readClientState<{ schedules?: Record<string, WorkflowSchedule> }>(tenantId, "wj.workflow");
    if (hasDueSchedule(doc?.schedules, now)) out.push(tenantId);
  }
  return out;
}

/** Tenants with a follow-up or interview near enough to be worth a reminder. */
export async function listTenantsWithDueReminders(now: Date, limit = 200): Promise<string[]> {
  const viaSql = await viaRpc("due_reminder_tenants", now, limit);
  if (viaSql) return viaSql;
  const tenants = await stateStore.listTenants("wj.applications", limit);
  const out: string[] = [];
  for (const tenantId of tenants) {
    const doc = await readClientState<{ applications?: Record<string, Application> }>(tenantId, "wj.applications");
    const due = Object.values(doc?.applications ?? {}).some((a) => (a?.followUps ?? []).some((f) => isDueForReminder(f, now.getTime())));
    if (due) out.push(tenantId);
  }
  return out;
}

export function hasDueSchedule(schedules: Record<string, WorkflowSchedule> | undefined, now: Date): boolean {
  return Object.values(schedules ?? {}).some((s) => s && isDue(s, now));
}
