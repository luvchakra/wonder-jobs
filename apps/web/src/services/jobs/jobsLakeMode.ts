/**
 * Whether this deployment's JobsLake is on, as `/api/jobs/sources` reports it at boot. Until the
 * answer arrives WonderJobs assumes it is and lets the server say otherwise (a disabled JobsLake
 * answers FEATURE_DISABLED, and the search falls back to the direct source path).
 */
export interface JobsLakeCapability {
  search: boolean;
  streaming: boolean;
}

let capability: JobsLakeCapability = { search: true, streaming: true };

export function setJobsLakeCapability(c: Partial<JobsLakeCapability>) {
  capability = { ...capability, ...c };
}

export function jobsLakeCapability(): JobsLakeCapability {
  return capability;
}
