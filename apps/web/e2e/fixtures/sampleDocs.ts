import { computeMatch, computeQuality, deduplicate } from "../../src/services/jobs/matching";
import { useApplicationsStore } from "../../src/store/applications";
import { useCareerStore } from "../../src/store/career";
import { useJobsStore } from "../../src/store/jobs";
import { useWorkflowStore } from "../../src/store/workflow";
import { SEED_DNA, seedActivity, seedApplications, seedInsights, seedNotifications, seedRoles, seedSchedules, seedUpcoming, seedWorkflows } from "../../src/testing/sample/seed";
import { seedRuns } from "../../src/testing/sample/runs";
import { getUniverse } from "../../src/testing/sample/universe";

/**
 * The sample candidate's persisted store documents: what the product would have saved for a candidate with this
 * history, written through the stores' own `partialize`. Used by e2e/fixtures/sample.ts and scripts/ui-check.mjs.
 */
let docs: Record<string, string> | undefined;

/** Built once per process. */
export function sampleDocs(): Record<string, string> {
  if (docs) return docs;
  const at = new Date().toISOString();
  useCareerStore.setState({ dna: SEED_DNA, onboarded: true, activity: seedActivity(), upcoming: seedUpcoming(), insights: seedInsights(), notifications: seedNotifications(), plan: "free", reminded: [], roles: seedRoles() });
  useApplicationsStore.setState({ applications: Object.fromEntries(seedApplications().map((a) => [a.id, a])) });
  useWorkflowStore.setState({
    runs: Object.fromEntries(seedRuns().map((r) => [r.id, r])),
    workflows: Object.fromEntries(seedWorkflows().map((w) => [w.id, w])),
    schedules: Object.fromEntries(seedSchedules().map((s) => [s.id, s])),
  });
  // The candidate's last results: the whole sample catalog, scored against their profile.
  const canonical = deduplicate(getUniverse().jobs);
  const sources = Object.fromEntries(useJobsStore.getState().sources.map((s) => [s.id, s]));
  const { dna, learnedSignals } = useCareerStore.getState();
  const jobs = Object.fromEntries(canonical.map((j) => [j.id, j]));
  const matches = Object.fromEntries(canonical.map((j) => [j.id, computeMatch(j, { dna, learnedSignals, preferredLocations: dna.preferredLocations })]));
  const quality = Object.fromEntries(canonical.map((j) => [j.id, computeQuality(j, sources)]));
  useJobsStore.setState({ jobs, order: canonical.map((j) => j.id), matches, quality, loaded: true, saved: { job_google_pm: at, job_amazon_growth: at, job_airbnb_pm: at }, rejected: {} });
  const persisted = (store: { persist: { getOptions: () => { name?: string; version?: number; partialize?: (s: never) => unknown } }; getState: () => unknown }): [string, string] => {
    const o = store.persist.getOptions();
    return [o.name!, JSON.stringify({ state: o.partialize ? o.partialize(store.getState() as never) : store.getState(), version: o.version ?? 0 })];
  };
  docs = Object.fromEntries([persisted(useCareerStore), persisted(useApplicationsStore), persisted(useWorkflowStore), persisted(useJobsStore)]);
  return docs;
}

