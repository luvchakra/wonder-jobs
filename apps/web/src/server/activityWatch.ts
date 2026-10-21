/**
 * Scraping watch (log only, never a block). Counts each address's API calls and distinct product pages
 * in a rolling hour, per server instance, and logs once when it passes what a person browsing would do.
 * The rate limiter still does any refusing; this is the evidence for deciding what to do next.
 */
const HOUR = 3_600_000;
export const WATCH_LIMITS = { apiCalls: 1_500, pages: 300 };
const MAX_ADDRESSES = 20_000;

type Window = { start: number; api: number; pages: Set<string>; logged: { api: boolean; pages: boolean } };
const windows = new Map<string, Window>();

/** The caller's address as the edge saw it (first `x-forwarded-for` entry), or "unknown". */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/** Records one request; returns what was logged, for tests. */
export function watchActivity(address: string, path: string, now = Date.now()): "api" | "pages" | null {
  let w = windows.get(address);
  if (!w || now - w.start > HOUR) {
    if (!w && windows.size >= MAX_ADDRESSES) windows.clear();
    w = { start: now, api: 0, pages: new Set(), logged: { api: false, pages: false } };
    windows.set(address, w);
  }
  if (path.startsWith("/api/")) {
    w.api += 1;
    if (w.api > WATCH_LIMITS.apiCalls && !w.logged.api) {
      w.logged.api = true;
      console.warn(`[scrape-watch] ${address} made over ${WATCH_LIMITS.apiCalls} API calls within an hour`);
      return "api";
    }
  } else if (w.pages.size <= WATCH_LIMITS.pages) {
    w.pages.add(path);
    if (w.pages.size > WATCH_LIMITS.pages && !w.logged.pages) {
      w.logged.pages = true;
      console.warn(`[scrape-watch] ${address} opened over ${WATCH_LIMITS.pages} different pages within an hour`);
      return "pages";
    }
  }
  return null;
}

/** Tests. */
export function resetActivityWatch() {
  windows.clear();
}
