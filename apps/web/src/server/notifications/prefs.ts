/** A person's Notify me about choices (domain/notifications/prefs.ts), kept with their account, inside the platform's settings. */
import { adminDefaults, allowedChannels, effectivePrefs, type NotifyAdmin } from "@/domain/notifications/admin";
import { cleanNotifyPrefs, topicOf, type NotifyPrefs, type NotifyTopic, type NudgeChannel } from "@/domain/notifications/prefs";
import type { Notification } from "@/domain/career/types";
import { stateStore } from "@/server/state";
import { loadNotifyAdmin } from "./admin";

const KEY = "wj.notifyprefs" as const;

export interface NotifyContext {
  /** What they chose (the platform's defaults where they never chose). */
  prefs: NotifyPrefs;
  /** What the platform lets them use. */
  allowed: Record<NotifyTopic, Record<NudgeChannel, boolean>>;
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

/** Which notifications this person keeps in their bell (their choice per kind), for a server writing to it. */
export async function bellFilter(tenantId: string): Promise<(category: Notification["category"]) => boolean> {
  const { effective } = await loadNotifyContext(tenantId);
  return (category) => effective[topicOf(category)].bell;
}
