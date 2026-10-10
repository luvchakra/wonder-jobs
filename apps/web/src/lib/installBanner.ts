/**
 * "Install the app" banner — the pure part (WJ-301).
 *
 * Everything that decides *whether* the banner shows lives here as plain functions of plain inputs, so
 * it is unit-tested without a browser (`installBanner.test.ts`). `components/pwa/InstallBanner.tsx`
 * only gathers those inputs from the browser and draws the result.
 *
 * The banner never guesses that a browser can install: Chromium-family browsers get the one-tap
 * variant only after they fire `beforeinstallprompt` (which itself means "installable, not installed");
 * iOS/iPadOS browsers that offer "Add to Home Screen" get the two-tap instructions; everything else —
 * desktop, Firefox on Android, in-app webviews — gets nothing.
 */

/** Which banner to draw, or none. */
export type InstallVariant = "one-tap" | "ios" | null;

/** What the browser tells us about the device. Every field is optional because every API is. */
export interface DeviceSignals {
  userAgent: string;
  /** `navigator.userAgentData?.mobile` (Chromium only). */
  uaDataMobile?: boolean;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints?: number;
  /** `matchMedia('(pointer: coarse)').matches`. */
  coarsePointer: boolean;
}

export interface DeviceInfo {
  /** A phone or tablet (not a desktop, not a desktop with a touchscreen). */
  mobileOrTablet: boolean;
  /** iOS or iPadOS, including iPadOS presenting itself as a Mac. */
  ios: boolean;
  /** An app's built-in browser (Instagram, Facebook, LinkedIn…) — these can't install anything. */
  inAppBrowser: boolean;
  /** On iOS/iPadOS: this browser offers "Add to Home Screen" in its share sheet. */
  iosCanAddToHomeScreen: boolean;
}

// In-app browsers on either platform. They render the page in a webview without install support.
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|LinkedInApp|Line\/|Twitter|Snapchat|Pinterest|TikTok|musical_ly|Bytedance|MicroMessenger|WhatsApp|GSA\/|; ?wv\)/i;
// Third-party iOS browsers; on iOS 16.4+ they offer Add to Home Screen in the share sheet, like Safari.
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave/i;

function iosVersion(ua: string): [number, number] | null {
  const os = /OS (\d+)[_.](\d+)/.exec(ua);
  if (os && /iPhone|iPad|iPod/.test(ua)) return [Number(os[1]), Number(os[2])];
  const v = /Version\/(\d+)\.(\d+)/.exec(ua);
  return v ? [Number(v[1]), Number(v[2])] : null;
}

/** Reads the device from the browser's signals. Pure: same signals, same answer. */
export function detectDevice(s: DeviceSignals): DeviceInfo {
  const ua = s.userAgent || "";
  const iPadAsMac = /Macintosh/.test(ua) && (s.maxTouchPoints ?? 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadAsMac;
  const mobileUa = s.uaDataMobile === true || /Android|iPhone|iPad|iPod/.test(ua) || iPadAsMac;
  // A coarse primary pointer is what separates a phone/tablet from a touchscreen laptop (whose primary
  // pointer is the trackpad or mouse, and whose user agent says nothing about mobile anyway).
  const mobileOrTablet = mobileUa && s.coarsePointer;
  // iOS webviews (in-app browsers) leave "Safari/" out of the user agent; Safari and the real browsers keep it.
  const inAppBrowser = IN_APP.test(ua) || (ios && !/Safari\//.test(ua));
  let iosCanAddToHomeScreen = false;
  if (ios && !inAppBrowser) {
    if (!IOS_OTHER_BROWSER.test(ua)) {
      iosCanAddToHomeScreen = true; // Safari has always offered it.
    } else {
      const v = iosVersion(ua);
      iosCanAddToHomeScreen = !!v && (v[0] > 16 || (v[0] === 16 && v[1] >= 4));
    }
  }
  return { mobileOrTablet, ios, inAppBrowser, iosCanAddToHomeScreen };
}

/** What this browser remembers about the banner (localStorage). */
export interface StoredInstallState {
  installed?: boolean;
  /** Epoch ms; the banner stays hidden until then. */
  snoozedUntil?: number;
}

export interface InstallInputs {
  device: DeviceInfo;
  /** Running as an installed app: display-mode standalone/fullscreen/minimal-ui/window-controls-overlay, or iOS `navigator.standalone`. */
  standalone: boolean;
  /** A `beforeinstallprompt` event is held and not yet used. */
  hasInstallPrompt: boolean;
  /** `navigator.getInstalledRelatedApps()` returned this app. */
  relatedAppInstalled: boolean;
  /** That check hasn't answered yet — hold the banner back rather than flash it and take it away. */
  relatedAppsPending: boolean;
  stored: StoredInstallState;
  now: number;
  /** A route the banner never appears on (auth callback, print/export, embedded). */
  excludedRoute: boolean;
  /** The page is inside a frame. */
  embedded: boolean;
}

/** The one decision: which banner (if any) to show. */
export function decideInstallBanner(i: InstallInputs): InstallVariant {
  if (i.excludedRoute || i.embedded) return null;
  if (!i.device.mobileOrTablet) return null;
  if (i.standalone) return null;
  if (i.stored.installed || i.relatedAppInstalled || i.relatedAppsPending) return null;
  if (i.stored.snoozedUntil && i.stored.snoozedUntil > i.now) return null;
  if (i.device.inAppBrowser) return null;
  if (i.hasInstallPrompt && !i.device.ios) return "one-tap";
  if (i.device.ios && i.device.iosCanAddToHomeScreen) return "ios";
  return null;
}

/** Routes the banner never appears on: auth callbacks/redirects, print or export views, embeds. */
export function isExcludedInstallRoute(pathname: string, search = ""): boolean {
  if (/^\/(auth|demo)(\/|$)/.test(pathname)) return true;
  if (/(^|\/)(print|export|embed)(\/|$)/.test(pathname)) return true;
  return /[?&](embed|print)=/.test(search);
}

export const INSTALL_STORAGE_KEY = "wonderjobs:install-banner";
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type KV = Pick<Storage, "getItem" | "setItem">;

/** Reads the remembered state. Blocked or corrupt storage reads as "nothing remembered". */
export function readInstallState(storage: KV | null | undefined): StoredInstallState {
  try {
    const raw = storage?.getItem(INSTALL_STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    return {
      installed: o.installed === true || undefined,
      snoozedUntil: typeof o.snoozedUntil === "number" && Number.isFinite(o.snoozedUntil) ? o.snoozedUntil : undefined,
    };
  } catch {
    return {};
  }
}

function write(storage: KV | null | undefined, state: StoredInstallState) {
  try {
    storage?.setItem(INSTALL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked (private mode, quota): the banner just won't remember. Nothing else breaks.
  }
}

/** The app is installed on this browser: never show the banner again here. */
export function rememberInstalled(storage: KV | null | undefined) {
  write(storage, { installed: true });
}

/** Dismissed, or the browser's prompt declined: hide for 14 days. */
export function rememberSnoozed(storage: KV | null | undefined, now: number) {
  write(storage, { snoozedUntil: now + INSTALL_SNOOZE_MS });
}

/**
 * Inline script for the root layout's <head>. `beforeinstallprompt` can fire before any app JavaScript
 * has loaded; this holds it (and notes `appinstalled`) on `window` so `lib/pwa.ts` picks it up when it
 * loads. The CSP already allows inline scripts (next.config.ts), as the app layout's early state fetch does.
 * Kept here, not in the "use client" pwa.ts, because the server layout must import it as a plain string.
 */
export const INSTALL_EARLY_CAPTURE = `(function(){var w=window;w.addEventListener("beforeinstallprompt",function(e){e.preventDefault();w.__wjInstallPrompt=e});w.addEventListener("appinstalled",function(){w.__wjInstallPrompt=null;w.__wjAppInstalled=true})})()`;
