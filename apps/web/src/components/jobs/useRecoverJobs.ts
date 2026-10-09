"use client";
import { useEffect } from "react";
import { applicationJobOf } from "@/domain/applications/types";
import { getClientMode } from "@/lib/mode";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";

const asked = new Set<string>();

/**
 * Jobs the candidate saved or applied to can drop out of the search results; find any of these ids that
 * aren't known any more on the server (asked once per id a session) and put them back. Signed-in only —
 * demo jobs are generated and never stored.
 */
export function useRecoverJobs(ids: (string | undefined)[]) {
  const known = useJobsStore((s) => s.jobs);
  const missing = ids.filter((id): id is string => !!id && !known[id] && !asked.has(id));
  const key = [...new Set(missing)].sort().join(",");
  useEffect(() => {
    if (!key || getClientMode().mode !== "user") return;
    for (const id of key.split(",")) asked.add(id);
    fetch(`/api/jobs/lookup?ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ jobs: import("@/domain/jobs/types").CanonicalJob[] }>) : { jobs: [] }))
      .then(({ jobs }) => {
        if (!jobs.length) return;
        useJobsStore.getState().restoreJobs(jobs);
        useApplicationsStore.getState().keepJobs(Object.fromEntries(jobs.map((j) => [j.id, applicationJobOf(j)])));
      })
      .catch(() => undefined);
  }, [key]);
}
