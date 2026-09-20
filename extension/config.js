/**
 * Where WonderJobs lives. The first origin that answers `/api/extension/token`
 * with a signed-in session wins, so a contributor running the app locally gets
 * their local data and everyone else gets production, with no build step.
 */
export const WONDERJOBS_ORIGINS = ["https://jobs.wonderapps.biz", "http://localhost:3000"];
