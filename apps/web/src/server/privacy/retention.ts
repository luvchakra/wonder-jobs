import { CONTACT_MESSAGE_RETENTION_DAYS } from "@/content/privacy";
import { getSupabaseAdmin } from "../supabase";

/**
 * Storage limitation (GDPR Art. 5(1)(e), DPDP s.8(7)): deletes what has outlived the retention period
 * published in `content/privacy.ts`. Run daily by the cron. Billing records are deliberately not here —
 * they are kept for the statutory period, and the ledger refuses deletes anyway.
 */
export async function purgeExpired(now = new Date()): Promise<{ contactMessages: number }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { contactMessages: 0 };
  const cutoff = new Date(now.getTime() - CONTACT_MESSAGE_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await sb.from("contact_messages").delete().lt("created_at", cutoff).select("id");
  if (error) throw new Error(error.message);
  return { contactMessages: data?.length ?? 0 };
}
