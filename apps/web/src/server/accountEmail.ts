import { getSupabaseAdmin } from "@/server/supabase";

/** The account's sign-in email (and first name), from Supabase Auth; null without one or without Auth. */
export async function accountEmail(tenantId: string): Promise<{ email: string; name?: string } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.auth.admin.getUserById(tenantId);
  if (error || !data?.user?.email) return null;
  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return { email: data.user.email, name: (meta.full_name || meta.name || "").split(" ")[0] || undefined };
}
