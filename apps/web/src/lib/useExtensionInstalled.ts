"use client";
import { useEffect, useState } from "react";

/**
 * Whether the WonderJobs browser extension is installed in this browser.
 *
 * The extension's content script on our own pages answers a ping with a pong
 * (see `extension/content/wonderjobs-bridge.js`) — that handshake is the only
 * thing the page can ask it for. `null` while we're still waiting, so the UI
 * can stay quiet instead of flashing "not installed" at someone who has it.
 */
export function useExtensionInstalled(timeoutMs = 400): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    let settled = false;
    const onPong = () => {
      settled = true;
      setInstalled(true);
    };
    window.addEventListener("wonderjobs:extension-pong", onPong);
    window.dispatchEvent(new CustomEvent("wonderjobs:extension-ping"));
    const timer = setTimeout(() => {
      if (!settled) setInstalled(false);
    }, timeoutMs);
    return () => {
      window.removeEventListener("wonderjobs:extension-pong", onPong);
      clearTimeout(timer);
    };
  }, [timeoutMs]);
  return installed;
}
