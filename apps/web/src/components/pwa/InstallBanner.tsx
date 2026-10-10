"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { hasInstallPrompt, promptInstall, subscribeInstall, wasInstalledHere } from "@/lib/pwa";
import { decideInstallBanner, detectDevice, isExcludedInstallRoute, readInstallState, rememberInstalled, rememberSnoozed, type DeviceInfo, type StoredInstallState } from "@/lib/installBanner";

/** `navigator` fields that aren't in lib.dom.d.ts everywhere. */
interface NavigatorExtras {
  userAgentData?: { mobile?: boolean };
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<unknown[]>;
}

interface ClientEnv {
  device: DeviceInfo;
  standalone: boolean;
  embedded: boolean;
  stored: StoredInstallState;
  now: number;
}

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

/**
 * The browser's answers, read once per page load. Cached deliberately: `useSyncExternalStore` compares
 * snapshots by identity, so a fresh object per call would re-render forever (see PushNotifications.tsx).
 */
let cachedEnv: ClientEnv | undefined;
function clientEnv(): ClientEnv {
  if (cachedEnv) return cachedEnv;
  const nav = navigator as Navigator & NavigatorExtras;
  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true; // A cross-origin parent throws on access — that's a frame too.
  }
  cachedEnv = {
    device: detectDevice({ userAgent: nav.userAgent, uaDataMobile: nav.userAgentData?.mobile, maxTouchPoints: nav.maxTouchPoints, coarsePointer: mq("(pointer: coarse)") }),
    standalone: nav.standalone === true || DISPLAY_MODES.some((m) => mq(`(display-mode: ${m})`)),
    embedded,
    stored: readInstallState(localStore()),
    now: Date.now(),
  };
  return cachedEnv;
}
const noSubscribe = () => () => {};
/** The server can't know any of this; rendering nothing is the safe answer (and matches hydration). */
const serverNull = () => null;
const serverFalse = () => false;

/** iOS's Share glyph (a square with an arrow out of the top), drawn inline so the instruction matches the button. */
function ShareGlyph() {
  return (
    <svg role="img" aria-label="Share" viewBox="0 0 24 24" className="mx-0.5 inline-block size-[1.15em] -translate-y-px align-middle text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v11" />
      <path d="M8.25 7.25 12 3.5l3.75 3.75" />
      <path d="M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
    </svg>
  );
}

/**
 * "Install the app" banner (WJ-301) — phones and tablets only, and only when this browser can really
 * install WonderJobs and it isn't installed here already. The decision itself is `decideInstallBanner`
 * (lib/installBanner.ts, unit-tested); this component gathers its inputs and draws it.
 *
 * Sits in the page flow above everything (root layout), so it pushes the page down instead of covering
 * it; the landing page's fixed header follows it through `--wj-install-offset`.
 */
export function InstallBanner() {
  const env = useSyncExternalStore<ClientEnv | null>(noSubscribe, clientEnv, serverNull);
  const promptHeld = useSyncExternalStore(subscribeInstall, hasInstallPrompt, serverFalse);
  const installedHere = useSyncExternalStore(subscribeInstall, wasInstalledHere, serverFalse);
  const pathname = usePathname() ?? "/";
  const [related, setRelated] = useState<{ pending: boolean; installed: boolean }>(() => ({
    pending: typeof navigator !== "undefined" && typeof (navigator as Navigator & NavigatorExtras).getInstalledRelatedApps === "function",
    installed: false,
  }));
  const [closed, setClosed] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stepsId = useId();

  // In a normal tab, ask the browser whether the installed app (listed in the manifest's
  // related_applications) is already on this device. Chromium on Android answers; others lack the API.
  useEffect(() => {
    const nav = navigator as Navigator & NavigatorExtras;
    if (typeof nav.getInstalledRelatedApps !== "function") return;
    let alive = true;
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (!alive) return;
        if (apps.length > 0) rememberInstalled(localStore());
        setRelated({ pending: false, installed: apps.length > 0 });
      })
      .catch(() => alive && setRelated({ pending: false, installed: false }));
    return () => {
      alive = false;
    };
  }, []);

  const variant =
    env && !closed && !installedHere
      ? decideInstallBanner({
          device: env.device,
          standalone: env.standalone,
          hasInstallPrompt: promptHeld,
          relatedAppInstalled: related.installed,
          relatedAppsPending: related.pending,
          stored: env.stored,
          now: env.now,
          excludedRoute: isExcludedInstallRoute(pathname, window.location.search),
          embedded: env.embedded,
        })
      : null;

  // Fixed headers (the landing page's) sit below the banner while it's on screen and move up as it scrolls away.
  useEffect(() => {
    const el = ref.current;
    if (!variant || !el) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = Math.max(0, el.getBoundingClientRect().bottom);
      root.style.setProperty("--wj-install-offset", `${Math.round(offset)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--wj-install-offset");
    };
  }, [variant]);

  if (!variant) return null;

  const dismiss = () => {
    rememberSnoozed(localStore(), Date.now());
    setClosed(true);
  };
  const install = async () => {
    setBusy(true);
    // Accepted is remembered as installed, declined as a 14-day snooze — both inside promptInstall.
    await promptInstall();
    setBusy(false);
    setClosed(true);
  };
  const added = () => {
    // Safari can't tell a tab that the app was added, so we take the person's word for it.
    rememberInstalled(localStore());
    setClosed(true);
  };

  const ios = variant === "ios";
  return (
    <div ref={ref} role="region" aria-label="Install the WonderJobs app" className="wj-install-banner relative z-[60] border-b border-line bg-surface shadow-xs">
      <div className="min-h-0 overflow-hidden">
        <div className="mx-auto max-w-3xl px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4">
          <div className="flex items-center gap-3">
            <Image src="/icon-192.png" alt="" width={192} height={192} className="size-11 shrink-0 rounded-[11px] shadow-sm" unoptimized />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-5 text-ink">WonderJobs app</p>
              <p className="text-[12.5px] leading-[1.15rem] text-ink-3">Your jobs one tap from your home screen, full screen.</p>
            </div>
            {ios ? (
              <Button variant="secondary" size="sm" className="rounded-full px-4" aria-expanded={howTo} aria-controls={stepsId} onClick={() => setHowTo((v) => !v)}>
                How to
              </Button>
            ) : (
              <Button size="sm" className="rounded-full px-4" loading={busy} onClick={install}>
                Install
              </Button>
            )}
            <button type="button" onClick={dismiss} aria-label="Not now" className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-bg-soft hover:text-ink">
              <X className="size-[18px]" aria-hidden />
            </button>
          </div>
          {ios && howTo && (
            <div id={stepsId} className="wj-animate-fade-up mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] bg-bg-soft px-3 py-2.5">
              <ol className="list-inside list-decimal space-y-1 text-[13px] leading-5 text-ink-2">
                <li>
                  Tap Share <ShareGlyph /> in the toolbar (or under •••)
                </li>
                <li>
                  Choose <span className="font-semibold text-ink">Add to Home Screen</span>
                </li>
              </ol>
              <Button variant="outline" size="sm" className="rounded-full" onClick={added}>
                I&apos;ve added it
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
