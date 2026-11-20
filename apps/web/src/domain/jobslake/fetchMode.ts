import type { SourceStatus } from "./protocol";

/**
 * When a source's data is fetched (owner, 2026-11-05: "create some clear difference between data which is only
 * retrieved when searched, compared to data which is fetched regularly. also try and clearly tell what admin need to do").
 *  - on_search: WorksLake asks the source live, only when someone searches with words. What comes back is kept, so a
 *    search without words shows it later; nothing is fetched in between.
 *  - scheduled: the data gateway collects it every few hours and stores it; searches read what was collected, never the
 *    site itself.
 *  - uploaded: a partner's own list, uploaded on Sources → Import.
 */
export type FetchMode = "on_search" | "scheduled" | "uploaded";

export const FETCH_MODE: Record<FetchMode, { label: string; tone: "info" | "success" | "neutral"; info: string }> = {
  on_search: { label: "On search", tone: "info", info: "Asked live only when someone searches with words. Nothing is fetched in between; what it returns is kept for later." },
  scheduled: { label: "Collected regularly", tone: "success", info: "Collected every few hours by the data gateway and stored. Searches read what was collected, never the site." },
  uploaded: { label: "Uploaded", tone: "neutral", info: "A partner's own list, uploaded on Sources → Import. Nothing is fetched." },
};

export interface TodoInput {
  mode: FetchMode;
  status: SourceStatus;
  /** Whether this deployment can query it now (its key is set, its connector exists). */
  available: boolean;
  /** The key(s) it still needs, by name, when one is missing. */
  missingKey?: string | null;
  /** The missing credential is the source's own (set on its Configuration tab), not a platform key. */
  keyOnSource?: boolean;
  /** A built-in that shows what the gateway collected (its listings come from the gateway's sources). */
  gatewayFed?: boolean;
  /** A partner portal that needs a signed partnership (LinkedIn, Indeed, Naukri…). */
  partner?: boolean;
}

/** Pure: what the admin needs to do for a source, in one line ("Nothing" when nothing). */
export function adminTodo(i: TodoInput): string {
  if (i.status === "do_not_use") return i.partner ? "Nothing now. It needs a partnership with the site; once one is signed, add its endpoint and credential on its page." : "Nothing: it's never used.";
  const live = i.status === "active" || i.status === "degraded";
  if (i.mode === "uploaded") return live ? "Nothing. Upload a new list on Sources → Import when the partner sends one." : "Upload the partner's list on Sources → Import, then activate it.";
  if (i.gatewayFed) return "Nothing here. Its listings come from the gateway's sources: switch those on with Test & activate on Sources → Import.";
  if (i.mode === "scheduled") return live ? "Nothing. It's collected on its schedule; if a collection fails, Sources → Import says why." : "Press Test & activate on Sources → Import. Until then it brings nothing in.";
  if (i.keyOnSource) return "Add its credential on its Configuration tab. Until then searches skip it.";
  if (i.missingKey) return `Set ${i.missingKey} on Admin → Keys. Until then searches skip it.`;
  if (i.status === "paused" || i.status === "disabled") return "Resume it if searches should ask it.";
  if (i.status === "draft" || i.status === "testing") return "Run its test, then activate it.";
  return live && i.available ? "Nothing. Searches ask it live." : "Open it and run its test: it can't be queried right now.";
}
