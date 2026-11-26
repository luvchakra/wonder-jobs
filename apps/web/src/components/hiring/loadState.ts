/**
 * What the Hiring page shows while its workspaces load (WJ-874). Before any data: the loading mark, or, once the
 * read failed, "Couldn't load Hiring" with Try again, never an endless loading page. Once data is in, a later failed
 * read leaves the page as it was and only says so in a toast.
 */
export type HiringLoadState = "loading" | "failed" | "ready";

export function hiringLoadState(hasData: boolean, failed: string | null): HiringLoadState {
  if (hasData) return "ready";
  return failed !== null ? "failed" : "loading";
}
