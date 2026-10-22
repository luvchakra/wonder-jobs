/**
 * The platform's notification settings (domain/notifications/admin.ts), kept under the platform tenant like the
 * scheduler's. Only platform admins write them; every delivery reads them. A short in-memory cache keeps a busy
 * cron from reading them once per person; an admin's save updates this instance at once.
 */
import { DEFAULT_NOTIFY_ADMIN, cleanNotifyAdmin, type NotifyAdmin } from "@/domain/notifications/admin";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

const KEY = "wj.notifyadmin" as const;
const TTL_MS = 60_000;
let cached: { at: number; value: NotifyAdmin } | null = null;

/** The settings in force; the defaults when none are saved or the store can't be read (people stay reachable). */
export async function loadNotifyAdmin(opts: { fresh?: boolean } = {}): Promise<NotifyAdmin> {
  const now = Date.now();
  if (!opts.fresh && cached && now - cached.at < TTL_MS) return cached.value;
  try {
    const value = cleanNotifyAdmin((await stateStore.get(PLATFORM_TENANT, KEY))?.state);
    cached = { at: now, value };
    return value;
  } catch (e) {
    console.error(`[notify-admin] unreadable, using defaults: ${e instanceof Error ? e.message : "unknown"}`);
    return DEFAULT_NOTIFY_ADMIN;
  }
}

export async function saveNotifyAdmin(raw: unknown, actor: string): Promise<NotifyAdmin> {
  const value: NotifyAdmin = { ...cleanNotifyAdmin(raw), updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, KEY, value);
  cached = { at: Date.now(), value };
  return value;
}

/** Tests: forget the cached copy. */
export function __resetNotifyAdminCache() {
  cached = null;
}
