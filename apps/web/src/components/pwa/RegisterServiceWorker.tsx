"use client";
import { useEffect } from "react";

/** Registers /public/sw.js so the app is installable. Production only — a cached SW fighting next dev's HMR is a bad time. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have, not load-bearing — fail silently.
    });
  }, []);
  return null;
}
