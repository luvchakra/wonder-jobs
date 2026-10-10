"use client";
import { useEffect, useState } from "react";
import { rememberInstalled, rememberSnoozed } from "@/lib/installBanner";

/** The event Chromium browsers fire when a page meets their installability criteria. Not in lib.dom.d.ts. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Set by `INSTALL_EARLY_CAPTURE` (lib/installBanner.ts, inlined by the root layout) before this module loads. */
interface EarlyCaptureWindow extends Window {
  __wjInstallPrompt?: BeforeInstallPromptEvent | null;
  __wjAppInstalled?: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function markInstalled() {
  deferredPrompt = null;
  installed = true;
  rememberInstalled(localStore());
  notify();
}

if (typeof window !== "undefined") {
  const w = window as EarlyCaptureWindow;
  // Pick up whatever the early script caught before this module loaded.
  if (w.__wjInstallPrompt) deferredPrompt = w.__wjInstallPrompt;
  if (w.__wjAppInstalled) markInstalled();
  // Hold the browser's own prompt back until something in the UI (the install banner, the avatar menu) asks for it.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", markInstalled);
}

/** Subscribe to changes in the held prompt or the installed flag. Returns the unsubscribe function. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a `beforeinstallprompt` event is held and unused right now. */
export const hasInstallPrompt = () => deferredPrompt !== null;
/** Whether `appinstalled` fired in this page (or an install was accepted). */
export const wasInstalledHere = () => installed;

/**
 * Shows the browser's own install prompt for the held event. A prompt can be shown only once per
 * event, so the event is released whatever the outcome. Accepted counts as installed straight away
 * (`appinstalled` follows and says the same); declined snoozes the install banner.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const p = deferredPrompt;
  deferredPrompt = null;
  try {
    await p.prompt();
    const choice = await p.userChoice;
    if (choice.outcome === "accepted") markInstalled();
    else {
      // Declined (from the banner or the avatar menu): don't offer the banner again for 14 days.
      rememberSnoozed(localStore(), Date.now());
      notify();
    }
    return choice.outcome;
  } catch {
    notify();
    return "unavailable";
  }
}

/**
 * Exposes whether the app can be installed right now with one tap (Chromium only — iOS Safari and
 * Firefox have no such API, so `available` stays false there; the install banner shows iOS its own
 * two-tap instructions instead) and a function that triggers the browser's own install prompt.
 */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(() => deferredPrompt !== null);
  useEffect(() => {
    const onChange = () => setAvailable(deferredPrompt !== null);
    const off = subscribeInstall(onChange);
    onChange();
    return off;
  }, []);

  return { available, promptInstall };
}
