import { describe, expect, it } from "vitest";
import {
  INSTALL_SNOOZE_MS,
  INSTALL_STORAGE_KEY,
  decideInstallBanner,
  detectDevice,
  isExcludedInstallRoute,
  readInstallState,
  rememberInstalled,
  rememberSnoozed,
  type DeviceSignals,
  type InstallInputs,
} from "./installBanner";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTabletChrome: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  iphoneChrome174: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneChrome163: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
  iphoneLinkedIn: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]",
  iphoneWebview: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

const phone = (userAgent: string, extra: Partial<DeviceSignals> = {}) => detectDevice({ userAgent, coarsePointer: true, maxTouchPoints: 5, ...extra });

const NOW = 1_800_000_000_000;
const base = (over: Partial<InstallInputs> = {}): InstallInputs => ({
  device: phone(UA.androidChrome),
  standalone: false,
  hasInstallPrompt: true,
  relatedAppInstalled: false,
  relatedAppsPending: false,
  stored: {},
  now: NOW,
  excludedRoute: false,
  embedded: false,
  ...over,
});

describe("detectDevice", () => {
  it("counts phones and tablets, including iPadOS presenting as a Mac", () => {
    expect(phone(UA.androidChrome).mobileOrTablet).toBe(true);
    expect(phone(UA.androidTabletChrome).mobileOrTablet).toBe(true);
    expect(phone(UA.iphoneSafari)).toMatchObject({ mobileOrTablet: true, ios: true, iosCanAddToHomeScreen: true });
    expect(phone(UA.ipadAsMac, { maxTouchPoints: 5 })).toMatchObject({ mobileOrTablet: true, ios: true, iosCanAddToHomeScreen: true });
  });

  it("does not count desktops — not even a touchscreen laptop or a Mac", () => {
    expect(detectDevice({ userAgent: UA.windowsChrome, coarsePointer: false, maxTouchPoints: 10, uaDataMobile: false }).mobileOrTablet).toBe(false);
    // A touchscreen whose primary pointer is still the trackpad.
    expect(detectDevice({ userAgent: UA.windowsChrome, coarsePointer: false, maxTouchPoints: 10 }).mobileOrTablet).toBe(false);
    expect(detectDevice({ userAgent: UA.macSafari, coarsePointer: false, maxTouchPoints: 0 })).toMatchObject({ mobileOrTablet: false, ios: false });
    // A mobile user agent without a coarse pointer (a phone UA spoofed on a desktop) doesn't count either.
    expect(detectDevice({ userAgent: UA.androidChrome, coarsePointer: false }).mobileOrTablet).toBe(false);
  });

  it("trusts userAgentData.mobile when the browser offers it", () => {
    expect(detectDevice({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)", uaDataMobile: true, coarsePointer: true }).mobileOrTablet).toBe(true);
  });

  it("flags in-app browsers on both platforms", () => {
    expect(phone(UA.instagramAndroid).inAppBrowser).toBe(true);
    expect(phone(UA.iphoneInstagram)).toMatchObject({ inAppBrowser: true, iosCanAddToHomeScreen: false });
    expect(phone(UA.iphoneLinkedIn)).toMatchObject({ inAppBrowser: true, iosCanAddToHomeScreen: false });
    expect(phone(UA.iphoneWebview)).toMatchObject({ inAppBrowser: true, iosCanAddToHomeScreen: false });
    expect(phone(UA.androidChrome).inAppBrowser).toBe(false);
    expect(phone(UA.samsung).inAppBrowser).toBe(false);
  });

  it("lets other iOS browsers add to the Home Screen only from iOS 16.4", () => {
    expect(phone(UA.iphoneChrome174).iosCanAddToHomeScreen).toBe(true);
    expect(phone(UA.iphoneChrome163).iosCanAddToHomeScreen).toBe(false);
  });
});

describe("decideInstallBanner", () => {
  it("desktop → hidden, even with an install prompt held", () => {
    const desktop = detectDevice({ userAgent: UA.windowsChrome, coarsePointer: false, maxTouchPoints: 0 });
    expect(decideInstallBanner(base({ device: desktop }))).toBeNull();
  });

  it("running as the installed app → hidden", () => {
    expect(decideInstallBanner(base({ standalone: true }))).toBeNull();
    expect(decideInstallBanner(base({ device: phone(UA.iphoneSafari), hasInstallPrompt: false, standalone: true }))).toBeNull();
  });

  it("Chromium phone or tablet with beforeinstallprompt → one-tap", () => {
    expect(decideInstallBanner(base())).toBe("one-tap");
    expect(decideInstallBanner(base({ device: phone(UA.androidTabletChrome) }))).toBe("one-tap");
    expect(decideInstallBanner(base({ device: phone(UA.samsung) }))).toBe("one-tap");
  });

  it("Chromium phone without the event → hidden (the browser hasn't said it can install)", () => {
    expect(decideInstallBanner(base({ hasInstallPrompt: false }))).toBeNull();
  });

  it("iOS Safari (iPhone and iPad) → two-tap instructions", () => {
    expect(decideInstallBanner(base({ device: phone(UA.iphoneSafari), hasInstallPrompt: false }))).toBe("ios");
    expect(decideInstallBanner(base({ device: phone(UA.ipadAsMac), hasInstallPrompt: false }))).toBe("ios");
    expect(decideInstallBanner(base({ device: phone(UA.iphoneChrome174), hasInstallPrompt: false }))).toBe("ios");
  });

  it("Firefox on Android and in-app webviews → hidden", () => {
    expect(decideInstallBanner(base({ device: phone(UA.firefoxAndroid), hasInstallPrompt: false }))).toBeNull();
    expect(decideInstallBanner(base({ device: phone(UA.instagramAndroid) }))).toBeNull();
    expect(decideInstallBanner(base({ device: phone(UA.iphoneInstagram), hasInstallPrompt: false }))).toBeNull();
    expect(decideInstallBanner(base({ device: phone(UA.iphoneChrome163), hasInstallPrompt: false }))).toBeNull();
  });

  it("already installed (getInstalledRelatedApps, or remembered) → hidden; held back while that check runs", () => {
    expect(decideInstallBanner(base({ relatedAppInstalled: true }))).toBeNull();
    expect(decideInstallBanner(base({ relatedAppsPending: true }))).toBeNull();
    expect(decideInstallBanner(base({ stored: { installed: true } }))).toBeNull();
    expect(decideInstallBanner(base({ device: phone(UA.iphoneSafari), hasInstallPrompt: false, stored: { installed: true } }))).toBeNull();
  });

  it("snoozed → hidden until the snooze ends", () => {
    expect(decideInstallBanner(base({ stored: { snoozedUntil: NOW + 1 } }))).toBeNull();
    expect(decideInstallBanner(base({ stored: { snoozedUntil: NOW - 1 } }))).toBe("one-tap");
  });

  it("excluded routes and embedded pages → hidden", () => {
    expect(decideInstallBanner(base({ excludedRoute: true }))).toBeNull();
    expect(decideInstallBanner(base({ embedded: true }))).toBeNull();
  });
});

describe("isExcludedInstallRoute", () => {
  it("excludes auth callbacks, demo redirects, print/export/embed views", () => {
    expect(isExcludedInstallRoute("/auth/callback")).toBe(true);
    expect(isExcludedInstallRoute("/demo/exit")).toBe(true);
    expect(isExcludedInstallRoute("/app/resume-studio/print")).toBe(true);
    expect(isExcludedInstallRoute("/app/jobs", "?embed=1")).toBe(true);
  });
  it("keeps public pages and the signed-in app", () => {
    for (const p of ["/", "/about", "/sign-in", "/help", "/app", "/app/jobs", "/app/applications/abc", "/onboarding", "/authors"]) {
      expect(isExcludedInstallRoute(p)).toBe(false);
    }
  });
});

describe("remembered state", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it("installed is remembered for good; a dismissal snoozes for 14 days", () => {
    const s = memory();
    rememberSnoozed(s, NOW);
    expect(readInstallState(s)).toEqual({ installed: undefined, snoozedUntil: NOW + INSTALL_SNOOZE_MS });
    expect(INSTALL_SNOOZE_MS).toBe(14 * 24 * 60 * 60 * 1000);
    rememberInstalled(s);
    expect(readInstallState(s).installed).toBe(true);
    expect([...s.m.keys()]).toEqual([INSTALL_STORAGE_KEY]);
    expect(INSTALL_STORAGE_KEY).toMatch(/^wonderjobs:/);
  });

  it("blocked or corrupt storage breaks nothing", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readInstallState(throwing)).toEqual({});
    expect(() => rememberInstalled(throwing)).not.toThrow();
    expect(() => rememberSnoozed(throwing, NOW)).not.toThrow();
    expect(readInstallState(null)).toEqual({});
    const s = memory();
    s.setItem(INSTALL_STORAGE_KEY, "{not json");
    expect(readInstallState(s)).toEqual({});
    s.setItem(INSTALL_STORAGE_KEY, JSON.stringify({ installed: "yes", snoozedUntil: "soon" }));
    expect(readInstallState(s)).toEqual({ installed: undefined, snoozedUntil: undefined });
  });
});
