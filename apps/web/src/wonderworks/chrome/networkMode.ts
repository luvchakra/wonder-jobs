"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { usePathname } from "next/navigation";
import { NETWORK_HREF } from "./nav";

/** Network's own pages (the feed, people, communities, profiles…). */
export const isNetworkPath = (p: string) => p === NETWORK_HREF || p.startsWith(`${NETWORK_HREF}/`);
/** Messages: one inbox for every module, so it opens in whichever mode the member came from (owner, 2026-11-23:
 * "clicking on messages icon in non network mode is taking it to network mode, that's not correct"). */
export const isMessagesPath = (p: string) => p === `${NETWORK_HREF}/messages` || p.startsWith(`${NETWORK_HREF}/messages/`);

/** Whether a page is in network mode: Network's pages are, a module's aren't, and Messages keeps the mode before it. */
export function networkModeFor(pathname: string, before: boolean): boolean {
  if (!isNetworkPath(pathname)) return false;
  return isMessagesPath(pathname) ? before : true;
}

// The mode of the last page that decided it, for Messages to keep. Momentary: a reload of Messages opens in the app.
const useLastMode = create<{ network: boolean; set: (v: boolean) => void }>((set) => ({ network: false, set: (network) => set({ network }) }));

export function useNetworkMode(): boolean {
  const pathname = usePathname();
  const before = useLastMode((s) => s.network);
  const set = useLastMode((s) => s.set);
  const mode = networkModeFor(pathname, before);
  useEffect(() => {
    if (!isMessagesPath(pathname)) set(mode);
  }, [pathname, mode, set]);
  return mode;
}
