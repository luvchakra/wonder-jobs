"use client";
import { useEffect } from "react";
import { schedulerTick, setReminderLeads } from "@/services/scheduler";
import { reminderLeads } from "@/domain/notifications/admin";
import { getClientMode } from "@/lib/mode";
import { cleanNotifyPrefs, type NotifyPrefs } from "@/domain/notifications/prefs";
import { setBellChoices } from "@/store/bellChoices";

/** Ticks the scheduler while the app is open: reminders surface, and due schedules fire on deployments where the server cron is not configured (see services/scheduler.ts). */
export function SchedulerRunner() {
  useEffect(() => {
    // Reminders are raised as early as the platform says (one cached request per page load, signed-in only).
    // And notices raised here are kept in the bell only for the kinds the candidate keeps there.
    if (getClientMode().mode === "user") {
      void fetch("/api/notify-settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { interviewLeadHours?: number; followUpLeadHours?: number } | null) => {
          if (d?.interviewLeadHours && d.followUpLeadHours) setReminderLeads(reminderLeads({ interviewLeadHours: d.interviewLeadHours, followUpLeadHours: d.followUpLeadHours }));
        })
        .catch(() => {});
      void fetch("/api/notify-prefs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { prefs?: NotifyPrefs } | null) => d?.prefs && setBellChoices(cleanNotifyPrefs(d.prefs)))
        .catch(() => {});
    }
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
