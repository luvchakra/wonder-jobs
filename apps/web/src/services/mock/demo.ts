"use client";
/**
 * Demo mode: the sample candidate ("Alex Morgan") with realistic history.
 * Applied once per device when the demo has no saved state yet. Real accounts
 * never see this data — they start empty and build state through onboarding
 * and runs (spec §2: no hard-coded data where a real source exists).
 */
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useWorkflowStore } from "@/store/workflow";
import { SEED_DNA, seedActivity, seedApplications, seedInsights, seedNotifications, seedSchedules, seedUpcoming, seedWorkflows } from "./seed";
import { seedRuns } from "./runs";

export function isDemoSeeded() {
  return useCareerStore.getState().dna.name === SEED_DNA.name;
}

export function seedDemo() {
  const at = new Date().toISOString();
  useCareerStore.setState({ dna: SEED_DNA, onboarded: true, activity: seedActivity(), upcoming: seedUpcoming(), insights: seedInsights(), notifications: seedNotifications(), plan: "free", reminded: [] });
  useApplicationsStore.setState({ applications: Object.fromEntries(seedApplications().map((a) => [a.id, a])) });
  useWorkflowStore.setState({
    runs: Object.fromEntries(seedRuns().map((r) => [r.id, r])),
    workflows: Object.fromEntries(seedWorkflows().map((w) => [w.id, w])),
    schedules: Object.fromEntries(seedSchedules().map((s) => [s.id, s])),
  });
  useJobsStore.setState({ saved: { job_google_pm: at, job_amazon_growth: at, job_airbnb_pm: at }, rejected: {} });
}
