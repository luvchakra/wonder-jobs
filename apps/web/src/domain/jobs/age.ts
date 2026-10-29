/**
 * Postings older than two weeks are "too old" (owner, 2026-10-17): WorksLake stops returning them and Find hides
 * them with that reason, because a job-board listing often outlives the employer's page. Saved jobs and jobs in
 * the Pipeline are never hidden for age. A posting with no readable date isn't judged.
 */
export const MAX_POSTING_AGE_DAYS = 14;
const DAY = 86_400_000;

export function postingTooOld(postedAt: string | undefined, now: number = Date.now()): boolean {
  const t = postedAt ? Date.parse(postedAt) : NaN;
  return Number.isFinite(t) && now - t > MAX_POSTING_AGE_DAYS * DAY;
}
