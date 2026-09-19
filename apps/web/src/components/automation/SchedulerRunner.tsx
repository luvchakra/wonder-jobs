"use client";
import { useEffect } from "react";
import { schedulerTick } from "@/services/scheduler";

/** Ticks the scheduler while the app is open: reminders surface, and due schedules fire on deployments where the server cron is not configured (see services/scheduler.ts). */
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
