import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

/**
 * Data-source decisions waiting on the owner that aren't a source record (owner, 2026-11-01: "anything related to data
 * source pending on me, should be in the set up page"). Each module session adds its own here, in its own PR; the owner
 * marks one done on Setup to-do, and it leaves the list. Sources needing a key, terms or activation are listed from
 * their own records (setup.ts), not here.
 */
export interface OwnerDecision {
  id: string;
  /** The module it concerns (a module id), or "all". */
  module: string;
  title: string;
  /** What to decide, and what each answer means, in a line or two. */
  detail: string;
  /** Where to read more or act, when there is a place. */
  href?: string;
}

export const OWNER_DECISIONS: OwnerDecision[] = [
  { id: "osm-overpass-server", module: "services", title: "Where OpenStreetMap collection runs", detail: "Talent & Services and Therapists collect OpenStreetMap businesses weekly through Overpass. The public overpass-api.de asks commercial users to run their own or a paid server. Pick one (self-hosted, a paid provider, or the public server for now).", href: "/platform/jobs-lake/gateway" },
  { id: "ticketmaster-cache", module: "events", title: "Ticketmaster: is a 24-hour search cache acceptable?", detail: "Ticketmaster's terms allow keeping content only “for reasonable periods”. WorksLake caches a search for up to 24 hours. Confirm, or ask for no caching." },
  { id: "developers-events-nc", module: "events", title: "developers.events: CC BY-NC licence", detail: "Its README licenses the data for non-commercial use only. It stays paused: decide WonderWorks' use is allowed, or ask the maintainers (scraly/developers-conferences-agenda) for permission." },
  { id: "gdg-cncf-robots", module: "events", title: "GDG and CNCF community events (Bevy API)", detail: "About 900 live developer community events, but their robots.txt disallows /api/, and WorksLake honours robots.txt. Keep it off, or ask Bevy or Google for permission." },
  { id: "freelancer-terms", module: "services", title: "Freelancer.com: caching and ratings", detail: "Its API terms limit caching to 24 hours and reserve its ratings. The source is live meanwhile. Confirm with Freelancer, or stop showing its ratings." },
  { id: "therapists-legal", module: "therapists", title: "Therapists: legal input", detail: "Before more than open-data practices: licence verification, health-data handling, crisis resources, and how practitioners' claims are shown." },
  { id: "teachaway-permission", module: "teaching", title: "TeachAway: written permission", detail: "TeachAway is a recruiter; its listings are in the gateway catalogue, paused. Its terms may need written permission rather than public reuse." },
  { id: "scheduler-settings", module: "all", title: "Check the Scheduler settings", detail: "Unit tests overwrote wj.scheduler earlier (before tests were isolated). Check the collection schedules and limits are what you want.", href: "/platform/jobs-lake/scheduler" },
];

export interface DecisionState {
  at: string;
  by: string;
  note?: string;
}

const KEY = "wj.setupdecisions" as const;

export async function decisionsDone(): Promise<Record<string, DecisionState>> {
  const doc = (await stateStore.get(PLATFORM_TENANT, KEY))?.state as { done?: Record<string, DecisionState> } | undefined;
  return doc?.done ?? {};
}

/** Marks a decision done (or, with done false, back on the list). Only known decisions. */
export async function setDecision(id: string, done: boolean, by: string, note?: string, now = new Date()): Promise<boolean> {
  if (!OWNER_DECISIONS.some((d) => d.id === id)) return false;
  const current = await decisionsDone();
  const next = { ...current };
  if (done) next[id] = { at: now.toISOString(), by: by.slice(0, 120), ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) };
  else delete next[id];
  await stateStore.put(PLATFORM_TENANT, KEY, { done: next });
  return true;
}
