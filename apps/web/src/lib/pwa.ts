"use client";
import { useEffect, useState } from "react";

/** The event Chromium browsers fire when a page meets their installability criteria. Not in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Hold the browser's own prompt back until something in the UI (the avatar menu) asks for it.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/**
 * Exposes whether the app can be installed right now (Chromium only — iOS Safari and Firefox have no
 * such API, so `available` stays false there and no install UI renders; that's an honest limitation,
 * not a bug) and a function that triggers the browser's own install prompt.
 */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(() => deferredPrompt !== null);
  useEffect(() => {
    const onChange = () => setAvailable(deferredPrompt !== null);
    listeners.add(onChange);
    onChange();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const promptInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    const p = deferredPrompt;
    await p.prompt();
    const choice = await p.userChoice;
    deferredPrompt = null;
    notify();
    return choice.outcome;
  };

  return { available, promptInstall };
}
