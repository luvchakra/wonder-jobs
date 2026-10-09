import { getSupabaseAdmin, touchTenant } from "./supabase";

/**
 * Server-side writes to the append-only action audit (`wonderjobs.action_audit`), for actions the
 * server itself performs on the candidate's behalf (cancelling a subscription, exporting or erasing
 * data). Rows can't be edited (migration 0008 trigger). Without Supabase this is a no-op, like
 * `/api/audit`. An audit failure never blocks the action it describes, but it is logged.
 */
export interface ServerAuditEvent {
  actionId: string;
  actionType: "cancel_subscription" | "privacy_export" | "privacy_erasure" | "privacy_notice" | "resume_file" | "test_plan" | "jobslake_api";
  event: string;
  detail?: string;
}

export async function recordServerAudit(tenantId: string, e: ServerAuditEvent): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  try {
    await touchTenant(tenantId);
    const { error } = await sb.from("action_audit").insert({ tenant_id: tenantId, action_id: e.actionId, action_type: e.actionType, event: e.event, detail: e.detail ?? null });
    if (error) console.error("[audit] write failed:", error.message);
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : "unknown");
  }
}
