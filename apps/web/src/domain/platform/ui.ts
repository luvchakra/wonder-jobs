/**
 * Which look the whole product wears (owner, 2026-11-28: "the new ui should be optional, keep a config in platform
 * level to switch to second ui. if i don't like it, i should be able to change to first ui").
 *
 * 1 is the first UI (the WonderWorks identity as it has been); 2 is the second (white, one accent, flat cards, pills,
 * a floating bottom bar). The choice is the platform's, the same for everyone, set in Admin → Settings. It changes
 * only how things look and are laid out: never a route, what is fetched, who may do what, or what an action does.
 *
 * A platform admin can also try the second UI on one device before switching everyone (`UI_PREVIEW_KEY`).
 */
export type UiVersion = 1 | 2;

export const UI_DEFAULT: UiVersion = 1;
export const UI_LABEL: Record<UiVersion, string> = { 1: "First UI", 2: "Second UI" };

export interface UiConfig {
  version: UiVersion;
  updatedAt?: string;
  updatedBy?: string;
}

export const isUiVersion = (v: unknown): v is UiVersion => v === 1 || v === 2;

/** The saved choice, or the first UI for anything missing or unusable: a bad value never changes the look. */
export function cleanUi(raw: unknown): UiConfig {
  const r = (raw ?? {}) as Partial<UiConfig>;
  return { version: isUiVersion(r.version) ? r.version : UI_DEFAULT, ...(typeof r.updatedAt === "string" ? { updatedAt: r.updatedAt } : {}), ...(typeof r.updatedBy === "string" ? { updatedBy: r.updatedBy } : {}) };
}

/** localStorage: the platform's choice as this browser last heard it (applied before first paint), and one device's preview. */
export const UI_STORED_KEY = "wj.look";
export const UI_PREVIEW_KEY = "wj.look.preview";

/** What this device shows: its own preview when one is set, else the platform's choice. */
export function effectiveUi(platform: unknown, preview: unknown): UiVersion {
  const p = Number(preview);
  if (isUiVersion(p)) return p;
  const v = Number(platform);
  return isUiVersion(v) ? v : UI_DEFAULT;
}

/**
 * Runs in <head> before anything paints: puts the look this browser last knew on <html data-ui>, so a reload never
 * flashes the other one. Plain ES5, no imports; it must never throw (private mode, storage off).
 */
export const UI_EARLY_APPLY = `try{var p=localStorage.getItem(${JSON.stringify(UI_PREVIEW_KEY)}),s=localStorage.getItem(${JSON.stringify(UI_STORED_KEY)}),v=p==="1"||p==="2"?p:s;if(v==="2")document.documentElement.setAttribute("data-ui","2")}catch(e){}`;
