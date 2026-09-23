"use client";
import { useMemo } from "react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useWorkflowStore } from "@/store/workflow";
import { useNow } from "@/lib/motion";
import { computeHomeAttention } from "@/domain/career/attention";

/**
 * The single computation behind "what deserves my attention today" — shared by the desktop and
 * mobile Home so they can never disagree about what counts as an opportunity, an application
 * needing attention, or a career action.
 */
export function useHomeAttention() {
  const now = useNow();
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const rejected = useJobsStore((s) => s.rejected);
  const applications = useApplicationsStore((s) => s.applications);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const runs = useWorkflowStore((s) => s.runs);
  const schedules = useWorkflowStore((s) => s.schedules);

  return useMemo(
    () => computeHomeAttention({ now, jobs, order, matches, quality, saved, rejected, applications, dna, learnedSignals, runs, schedules }),
    [now, jobs, order, matches, quality, saved, rejected, applications, dna, learnedSignals, runs, schedules],
  );
}
