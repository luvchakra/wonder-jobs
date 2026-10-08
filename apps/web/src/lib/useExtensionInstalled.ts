"use client";
import { useEffect, useState } from "react";

/** How often the page asks again while it waits, and when it asks again later (coming back to the tab). */
const RETRY_MS = 200;

/**
 * Whether the WonderJobs browser extension is installed in this browser.
 *
 * The extension's content script on our own pages answers a ping with a pong
 * (see `extension/content/wonderjobs-bridge.js`) — that handshake is the only
 * thing the page can ask it for. `null` while we're still waiting, so the UI
 * can stay quiet instead of flashing "not installed" at someone who has it.
 *
 * The content script loads at `document_idle`, which can be after this page has hydrated, so a single
 * ping can go out before anyone is listening. The page keeps asking until the timeout, and keeps
 * listening afterwards: a late answer (a slow load, or the helper put into this tab after it was
 * installed or updated) turns "not installed" into installed without a reload.
 */
export function useExtensionInstalled(timeoutMs = 1000): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    let settled = false;
    const ping = () => window.dispatchEvent(new CustomEvent("wonderjobs:extension-ping"));
    const onPong = () => {
      settled = true;
      clearInterval(retry);
      setInstalled(true);
    };
    const onVisible = () => {
      if (!settled && document.visibilityState === "visible") ping();
    };
    window.addEventListener("wonderjobs:extension-pong", onPong);
    // The bridge announces itself after it hands the extension a token; that counts as an answer too.
    window.addEventListener("wonderjobs:extension-connected", onPong);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const retry = setInterval(ping, RETRY_MS);
    ping();
    const timer = setTimeout(() => {
      clearInterval(retry);
      if (!settled) setInstalled(false);
    }, timeoutMs);
    return () => {
      window.removeEventListener("wonderjobs:extension-pong", onPong);
      window.removeEventListener("wonderjobs:extension-connected", onPong);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(retry);
      clearTimeout(timer);
    };
  }, [timeoutMs]);
  return installed;
}
