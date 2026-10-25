"use client";
import { useSyncExternalStore } from "react";
import { detectDevice } from "@/lib/installBanner";

let cached: boolean | undefined;
function read(): boolean {
  if (cached === undefined) {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    cached = detectDevice({ userAgent: nav.userAgent, uaDataMobile: nav.userAgentData?.mobile, maxTouchPoints: nav.maxTouchPoints, coarsePointer: window.matchMedia("(pointer: coarse)").matches }).mobileOrTablet;
  }
  return cached;
}
const noop = () => () => {};

/**
 * A phone or tablet (not a desktop, not a desktop with a touchscreen) — where the browser helper can't run, so
 * desktop-only settings fold away. null on the server render.
 */
export function useHandheld(): boolean | null {
  return useSyncExternalStore(noop, read, () => null);
}
