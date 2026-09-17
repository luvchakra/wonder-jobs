"use client";
import { useEffect } from "react";
import { schedulerTick } from "@/services/scheduler";

/** Runs the mock scheduler while the app is open: due schedules fire, reminders surface. */
export function SchedulerRunner() {
  useEffect(() => {
    const t0 = setTimeout(() => schedulerTick(), 1500);
    const id = setInterval(() => schedulerTick(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedulerTick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
