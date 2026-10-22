/** A person's Notify me about choices (domain/notifications/prefs.ts), kept with their account on the server. */
import { DEFAULT_NOTIFY_PREFS, cleanNotifyPrefs, type NotifyPrefs } from "@/domain/notifications/prefs";
import { stateStore } from "@/server/state";

const KEY = "wj.notifyprefs" as const;

/** Their choices; the defaults when none are saved or the store can't be read (they're never left unreached). */
export async function loadNotifyPrefs(tenantId: string): Promise<NotifyPrefs> {
  try {
    return cleanNotifyPrefs((await stateStore.get(tenantId, KEY))?.state);
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export async function saveNotifyPrefs(tenantId: string, raw: unknown): Promise<NotifyPrefs> {
  const prefs = cleanNotifyPrefs(raw);
  await stateStore.put(tenantId, KEY, prefs);
  return prefs;
}
