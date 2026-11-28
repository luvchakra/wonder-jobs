"use client";
import { useEffect, useSyncExternalStore } from "react";
import { effectiveUi, UI_PREVIEW_KEY, UI_STORED_KEY, isUiVersion, type UiVersion } from "@/domain/platform/ui";

/**
 * The look this page wears (domain/platform/ui.ts): `<html data-ui="2">` for the second UI, nothing for the first.
 * The tokens in globals.css follow that attribute; a component whose layout differs reads `useUi()`.
 * The platform's choice is fetched once per page load (edge-cached) and remembered in this browser, so the next load
 * paints the right look at once (`UI_EARLY_APPLY` in <head>).
 */
const THEME = { 1: "#f6f6fb", 2: "#ffffff" } as const;
const listeners = new Set<() => void>();
let request: Promise<unknown> | null = null;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage off: the look still applies for this page */
  }
};

const current = (): UiVersion => (document.documentElement.getAttribute("data-ui") === "2" ? 2 : 1);

function apply(version: UiVersion) {
  if (current() === version) return;
  const root = document.documentElement;
  if (version === 2) root.setAttribute("data-ui", "2");
  else root.removeAttribute("data-ui");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME[version]);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** 1 or 2. The server renders the first UI; a browser showing the second switches as it hydrates. */
export function useUi(): UiVersion {
  return useSyncExternalStore(subscribe, current, () => 1 as UiVersion);
}

/** This device's own preview (platform admins, Admin → Settings), or null when it follows the platform. */
export function uiPreview(): UiVersion | null {
  const p = Number(read(UI_PREVIEW_KEY));
  return isUiVersion(p) ? p : null;
}

export function setUiPreview(version: UiVersion | null) {
  write(UI_PREVIEW_KEY, version === null ? null : String(version));
  apply(effectiveUi(read(UI_STORED_KEY), version));
}

/** The platform changed its choice from this page (Admin → Settings): show it here at once. */
export function platformUiChanged(version: UiVersion) {
  write(UI_STORED_KEY, String(version));
  apply(effectiveUi(version, read(UI_PREVIEW_KEY)));
}

/** Mounted once in the root layout: learns the platform's choice and applies it. Renders nothing. */
export function UiSync() {
  useEffect(() => {
    request ??= fetch("/api/ui")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    void request.then((body) => {
      const v = (body as { version?: unknown } | null)?.version;
      if (!isUiVersion(v)) return; // unreachable or unusable: keep what this browser last knew
      write(UI_STORED_KEY, String(v));
      apply(effectiveUi(v, read(UI_PREVIEW_KEY)));
    });
  }, []);
  return null;
}
