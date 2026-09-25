/**
 * JobsLake feature flags (spec §81). On by default except MCP; each can be switched off with its
 * environment variable set to "0" — so every migration step is reversible without a deploy of code.
 */
export interface JobsLakeFlags {
  jobsLakeEnabled: boolean;
  jobsLakeSearchEnabled: boolean;
  jobsLakeStreamingEnabled: boolean;
  jobsLakeWarmPoolEnabled: boolean;
  jobsLakeMcpEnabled: boolean;
  jobsLakeAdminEnabled: boolean;
}

const on = (name: string, dflt: boolean) => {
  const v = process.env[name];
  if (v === undefined || v === "") return dflt;
  return !/^(0|false|off|no)$/i.test(v);
};

export function jobsLakeFlags(): JobsLakeFlags {
  const enabled = on("JOBSLAKE_ENABLED", true);
  return {
    jobsLakeEnabled: enabled,
    jobsLakeSearchEnabled: enabled && on("JOBSLAKE_SEARCH_ENABLED", true),
    jobsLakeStreamingEnabled: enabled && on("JOBSLAKE_STREAMING_ENABLED", true),
    jobsLakeWarmPoolEnabled: enabled && on("JOBSLAKE_WARM_POOL_ENABLED", true),
    // MCP is off unless explicitly turned on, and even then needs JOBSLAKE_MCP_TOKEN.
    jobsLakeMcpEnabled: enabled && on("JOBSLAKE_MCP_ENABLED", false),
    jobsLakeAdminEnabled: enabled && on("JOBSLAKE_ADMIN_ENABLED", true),
  };
}
