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
  { id: "smartrecruiters", name: "SmartRecruiters career sites", short: "sr", integrated: true, enabled: true, reliability: "high", color: "#1c9f6a", website: "https://www.smartrecruiters.com", note: "Public career pages of Swiggy, Freshworks, Bosch, Continental and Delivery Hero. Applications go straight to the employer." },
  { id: "jazzhr", name: "JazzHR career sites", short: "jz", integrated: true, enabled: true, reliability: "high", color: "#e8590c", website: "https://www.jazzhr.com", note: "Public job feeds of companies hiring on JazzHR (HackerEarth, Ebizon, ProcDNA, Evertz, ArangoDB and more). Applications go straight to the employer." },
  { id: "themuse", name: "The Muse", short: "tm", integrated: true, enabled: true, reliability: "medium", color: "#7c3aed", website: "https://www.themuse.com", note: "Employers that post on The Muse, including the India offices of large companies. You apply from The Muse's page for the role." },
  { id: "remotive", name: "Remotive", short: "rm", integrated: true, enabled: false, reliability: "medium", color: "#1f6feb", website: "https://remotive.com", note: "Curated remote jobs. The public feed exposes only a handful of listings, so it is off by default." },
  { id: "jobicy", name: "Jobicy", short: "jb", integrated: true, enabled: true, reliability: "medium", color: "#ff6b6b", website: "https://jobicy.com", note: "Remote jobs with seniority and salary data where the employer disclosed it." },
  { id: "remoteok", name: "Remote OK", short: "ok", integrated: true, enabled: true, reliability: "medium", color: "#ff4742", website: "https://remoteok.com", note: "Remote jobs, latest 100 per search." },
  { id: "himalayas", name: "Himalayas", short: "hm", integrated: true, enabled: true, reliability: "medium", color: "#0ea5e9", website: "https://himalayas.app", note: "Large remote-jobs feed; Wonder scans the newest postings for your search." },
  { id: "arbeitnow", name: "Arbeitnow", short: "an", integrated: true, enabled: false, reliability: "medium", color: "#111827", website: "https://www.arbeitnow.com", note: "Europe-focused (mostly Germany). Off by default." },
  { id: "theirstack", name: "TheirStack", short: "ts", integrated: true, enabled: true, reliability: "high", color: "#0f766e", website: "https://theirstack.com", requiresSetup: true, note: "Licensed jobs from LinkedIn, Indeed, ATS boards and company career sites worldwide. Paid per job, so Wonder asks it only when the free sources find too few. Needs THEIRSTACK_API_KEY (or several, comma-separated, in THEIRSTACK_API_KEYS) on the server." },
  { id: "adzuna_in", name: "Adzuna India", short: "ad", integrated: true, enabled: true, reliability: "high", color: "#1e8f5a", website: "https://www.adzuna.in", requiresSetup: true, note: "India-wide postings across job boards. Needs ADZUNA_APP_ID and ADZUNA_APP_KEY on the server (free tier)." },
];

export const JOB_SOURCE_IDS = JOB_SOURCES.map((s) => s.id);

export function isJobSourceId(id: string) {
  return JOB_SOURCE_IDS.includes(id);
}

/**
 * Merge a persisted source list with the registry: keep the user's on/off choices, drop retired ids, add new ones.
 * A credentialed source keeps its choice too — it is only forced off when the server last said it had no credentials.
 */
export function reconcileSources(persisted: JobSource[] | undefined, known?: Record<string, boolean | undefined>): JobSource[] {
  const byId = new Map((persisted ?? []).map((s) => [s.id, s]));
  return JOB_SOURCES.map((s) => {
    const p = byId.get(s.id);
    // What the server said this session beats what was persisted last time.
    const available = known?.[s.id] ?? p?.available;
    if (!p) return available === undefined ? s : { ...s, available };
    // A credentialed source the candidate never switched themselves follows the registry: on once the server can search it.
    const enabled = s.requiresSetup && available === false ? false : s.requiresSetup && !p.chosen ? s.enabled : p.enabled;
    return { ...s, enabled, available, ...(p.chosen ? { chosen: true } : {}) };
  });
}
