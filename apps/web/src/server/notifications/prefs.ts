/** A person's Notify me about choices (domain/notifications/prefs.ts), kept with their account, inside the platform's settings. */
import { adminDefaults, allowedChannels, effectivePrefs, type NotifyAdmin } from "@/domain/notifications/admin";
import { cleanNotifyPrefs, type NotifyChannel, type NotifyPrefs, type NotifyTopic } from "@/domain/notifications/prefs";
import { stateStore } from "@/server/state";
import { loadNotifyAdmin } from "./admin";

const KEY = "wj.notifyprefs" as const;

export interface NotifyContext {
  /** What they chose (the platform's defaults where they never chose). */
  prefs: NotifyPrefs;
  /** What the platform lets them use. */
  allowed: Record<NotifyTopic, Record<NotifyChannel, boolean>>;
  /** What actually goes: their choice, where allowed. */
  effective: NotifyPrefs;
  admin: NotifyAdmin;
}

async function stored(tenantId: string): Promise<unknown> {
  try {
    return (await stateStore.get(tenantId, KEY))?.state;
  } catch {
    return undefined;
  }
}

/** Their choices; the platform's defaults when none are saved or the store can't be read (they're never left unreached). */
export async function loadNotifyPrefs(tenantId: string): Promise<NotifyPrefs> {
  return (await loadNotifyContext(tenantId)).prefs;
}

export async function loadNotifyContext(tenantId: string): Promise<NotifyContext> {
  const admin = await loadNotifyAdmin();
  const prefs = cleanNotifyPrefs(await stored(tenantId), adminDefaults(admin));
  return { prefs, allowed: allowedChannels(admin), effective: effectivePrefs(prefs, admin), admin };
}

export async function saveNotifyPrefs(tenantId: string, raw: unknown): Promise<NotifyPrefs> {
  const admin = await loadNotifyAdmin();
  const prefs = cleanNotifyPrefs(raw, adminDefaults(admin));
  await stateStore.put(tenantId, KEY, prefs);
  return prefs;
}
