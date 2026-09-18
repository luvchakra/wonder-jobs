import type { JobSource } from "./types";

/**
 * Real job sources. Each id has a server-side fetcher (see server/jobs) that
 * reads the source's public API and normalizes postings; the UI never invents
 * a listing. Sources that need credentials advertise `requiresSetup` and show
 * as unavailable until the server has them.
 */
export const JOB_SOURCES: JobSource[] = [
  {
    id: "careers",
    name: "Company career sites",
    short: "cs",
    integrated: true,
    enabled: true,
    reliability: "high",
    color: "#6d4cf5",
    website: "",
    note: "Public Greenhouse, Lever and Ashby boards of companies hiring in India and remotely. Applications go straight to the employer.",
  },
  { id: "remotive", name: "Remotive", short: "rm", integrated: true, enabled: false, reliability: "medium", color: "#1f6feb", website: "https://remotive.com", note: "Curated remote jobs. The public feed exposes only a handful of listings, so it is off by default." },
  { id: "jobicy", name: "Jobicy", short: "jb", integrated: true, enabled: true, reliability: "medium", color: "#ff6b6b", website: "https://jobicy.com", note: "Remote jobs with seniority and salary data where the employer disclosed it." },
  { id: "remoteok", name: "Remote OK", short: "ok", integrated: true, enabled: true, reliability: "medium", color: "#ff4742", website: "https://remoteok.com", note: "Remote jobs, latest 100 per search." },
  { id: "himalayas", name: "Himalayas", short: "hm", integrated: true, enabled: true, reliability: "medium", color: "#0ea5e9", website: "https://himalayas.app", note: "Large remote-jobs feed; Wonder scans the newest postings for your search." },
  { id: "arbeitnow", name: "Arbeitnow", short: "an", integrated: true, enabled: false, reliability: "medium", color: "#111827", website: "https://www.arbeitnow.com", note: "Europe-focused (mostly Germany). Off by default." },
  { id: "adzuna_in", name: "Adzuna India", short: "ad", integrated: true, enabled: false, reliability: "high", color: "#1e8f5a", website: "https://www.adzuna.in", requiresSetup: true, note: "India-wide postings across job boards. Needs ADZUNA_APP_ID and ADZUNA_APP_KEY on the server (free tier)." },
];

export const JOB_SOURCE_IDS = JOB_SOURCES.map((s) => s.id);

export function isJobSourceId(id: string) {
  return JOB_SOURCE_IDS.includes(id);
}

/** Merge a persisted source list with the registry: keep the user's on/off choices, drop retired ids, add new ones. */
export function reconcileSources(persisted: JobSource[] | undefined): JobSource[] {
  const byId = new Map((persisted ?? []).map((s) => [s.id, s]));
  return JOB_SOURCES.map((s) => {
    const p = byId.get(s.id);
    return p ? { ...s, enabled: s.requiresSetup ? s.enabled : p.enabled, available: p.available } : s;
  });
}
