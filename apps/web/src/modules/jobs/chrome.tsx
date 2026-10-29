"use client";
import { useMemo } from "react";
import { Briefcase, Clock } from "lucide-react";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { findModeOf, type FindMode } from "@/domain/jobs/findMode";
import { computeApplicationAttention } from "@/domain/career/attention";
import { actionsRequired } from "@/domain/digest/build";
import { switchFindMode } from "@/lib/switchFindMode";
import { useNow } from "@/lib/motion";
import type { MenuItem } from "@/wonderworks/chrome/ModuleMenu";

/** Jobs' choices in WonderWorks' module menu: Full Time Jobs and Part Time Jobs, each in its tint (§9 "Icons"). */
export const JOBS_MENU_CHOICES: Omit<MenuItem, "on">[] = [
  { id: "full_time", label: "Full Time Jobs", hint: "Searches your Career Profile", icon: Briefcase, tint: "lavender" },
  { id: "part_time", label: "Part Time Jobs", hint: "Searches the words you type", icon: Clock, tint: "lightblue" },
];

/** Find's current mode, and switching it in place. */
export const useJobsFindMode = () => useJobsStore((s) => findModeOf(s.filters));
export const pickJobsFindMode = (id: string) => switchFindMode(id as FindMode);

/**
 * What the top bar shows from Jobs: how many things need the candidate (Tasks' badge — the same list the Tasks page
 * shows; the clock coarsened to the hour) and their career status, derived from real application state.
 */
export function useJobsStatus(hydrated: boolean): { tasks: number; careerStatus: string } {
  const applications = useApplicationsStore((s) => s.applications);
  const hour = Math.floor(useNow() / 3_600_000);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const tasks = useMemo(
    () => computeApplicationAttention(applications, hour * 3_600_000).length + actionsRequired({ dna, learnedSignals: learnedSignals ?? [], applications: Object.values(applications) }).filter((a) => a.href !== "/app/applications").length,
    [applications, hour, dna, learnedSignals],
  );
  const apps = Object.values(applications);
  const careerStatus = !hydrated ? "Career Explorer" : apps.some((a) => a.status === "offer") ? "Deciding on an offer" : apps.some((a) => a.status === "interview") ? "Interviewing" : apps.some((a) => a.status === "submitted" || a.status === "under_review") ? "Actively applying" : "Career Explorer";
  return { tasks, careerStatus };
}
