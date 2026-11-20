/**
 * OpenAgenda as an Events source (https://developers.openagenda.com): the public agendas of French and European towns,
 * museums and associations, with each event's dates, place and own page. Needs a free key (a public key "oa_pk_…" from the
 * account's API settings); off until the server has OPENAGENDA_API_KEY ("Needs setup"). Built from OpenAgenda's published API
 * documentation (v2), not yet run with a real key.
 *
 * How it reads (the API lists events per agenda, never across them): for a search, the official agendas that match the person's
 * words or place (GET /v2/agendas?official=1&search=…), then the upcoming events of the first few
 * (GET /v2/agendas/{uid}/events?relative[]=upcoming). Each answer is kept for an hour (feeds.ts), the key travels in the `key`
 * header and never in a URL, a log or a result. With neither words nor a place there is nothing to search: it says so.
 *
 * Licences are per event (`rights.license`): only events under an open licence (Licence Ouverte 2.0, Creative Commons without
 * non-commercial or no-derivatives terms, CC0, ODbL, ODC-BY) are shown, and each says who it is from (`rights.licensor`), under
 * which licence and when it was updated, as the Licence Ouverte asks. An event with no stated licence is left out.
 *
 * Genuine and traceable: an event shows what OpenAgenda states (title, first upcoming time, place, description) and links to
 * its own page. A cancelled or postponed event is left out; no organiser, price or seats are shown.
 */
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import { platformKey } from "@/server/jobslake/platformKeys";
import { readFeed } from "./feeds";
import type { Job } from "@/domain/jobs/types";
import type { RawPosting } from "@/services/jobs/normalize";

export const OPENAGENDA = "evt_openagenda";
export const OPENAGENDA_KEY = "OPENAGENDA_API_KEY";
const API = "https://api.openagenda.com/v2";
const AGENDAS = 5;
const EVENTS = 20;

export const openAgendaAvailable = () => !!platformKey(OPENAGENDA_KEY);

export interface OaAgenda {
  uid?: number | string;
  slug?: string;
  title?: string;
}
type Multi = string | Record<string, string | undefined> | undefined;
export interface OaEvent {
  uid?: number | string;
  slug?: string;
  title?: Multi;
  description?: Multi;
  keywords?: string[] | Record<string, string[] | undefined>;
  timings?: { begin?: string; end?: string }[];
  timezone?: string;
  /** 1 in person, 2 online, 3 both. */
  attendanceMode?: number;
  /** 1 scheduled, 2 rescheduled, 3 moved online, 4 postponed, 5 full, 6 cancelled. */
  status?: number;
  canonicalUrl?: string;
  updatedAt?: string;
  location?: { name?: string; city?: string; countryCode?: string } | null;
  rights?: { license?: { id?: string; name?: string }; licensor?: { name?: string } };
}

/** The licences whose terms let WonderWorks show an event with its credit: open data and Creative Commons without NC or ND. */
const OPEN_LICENCE = /^(etalab-2\.0|cc0(-1\.0)?|cc-by(-sa)?(-[0-9.]+)?|odbl(-1\.0)?|odc-by(-1\.0)?|odc-pddl(-1\.0)?|lov2|licence-ouverte(-2\.0)?)$/i;
export const isOpenLicence = (id: unknown) => typeof id === "string" && OPEN_LICENCE.test(id.trim());

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** A multilingual field as one text: the English, else the French, else any. */
const text = (v: Multi, max = 200): string => {
  if (typeof v === "string") return clean(v, max);
  if (!v || typeof v !== "object") return "";
  return clean(v.en, max) || clean(v.fr, max) || clean(Object.values(v).find((x) => typeof x === "string" && x.trim()), max);
};
const country = (code: unknown) => {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(c)) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? "";
  } catch {
    return "";
  }
};

/** One event as a WorksLake event posting, or null when it can't honestly be shown (no upcoming time, no title, no open licence, cancelled). */
export function toRawEvent(e: OaEvent, agenda: OaAgenda, now = Date.now()): RawPosting | null {
  const title = text(e.title, 160);
  if (!title || e.uid === undefined || !isOpenLicence(e.rights?.license?.id)) return null;
  // A cancelled or postponed event has no firm time to show.
  if (e.status === 4 || e.status === 6) return null;
  // The first time still to come (or in progress).
  const next = (e.timings ?? []).filter((t) => t.begin && Date.parse(t.begin) && Date.parse(t.end ?? t.begin) >= now).sort((a, b) => Date.parse(a.begin ?? "") - Date.parse(b.begin ?? ""))[0];
  if (!next?.begin) return null;
  const own = clean(e.canonicalUrl, 500);
  const slug = clean(e.slug, 160);
  const agendaSlug = clean(agenda.slug, 120);
  const url = /^https:\/\//i.test(own) ? own : slug && agendaSlug ? `https://openagenda.com/${encodeURIComponent(agendaSlug)}/events/${encodeURIComponent(slug)}` : "";
  if (!url) return null;
  const loc = e.location ?? undefined;
  const online = e.attendanceMode === 2 || e.attendanceMode === 3;
  const city = clean(loc?.city, 80);
  const place = [clean(loc?.name, 100), city, country(loc?.countryCode)].filter((x, i, all) => x && all.indexOf(x) === i).join(", ");
  const lic = e.rights?.license;
  const credit = `Source: ${clean(e.rights?.licensor?.name, 100) || "OpenAgenda"}${lic?.name ? `, ${clean(lic.name, 60)}` : ""}${e.updatedAt && !Number.isNaN(Date.parse(e.updatedAt)) ? `. Updated ${new Date(e.updatedAt).toISOString().slice(0, 10)}` : ""}.`;
  const kw = Array.isArray(e.keywords) ? e.keywords : e.keywords ? (e.keywords.en ?? e.keywords.fr ?? Object.values(e.keywords).find(Array.isArray) ?? []) : [];
  const zone = clean(e.timezone, 60);
  return {
    externalId: `${agenda.uid ?? agendaSlug}:${e.uid}`,
    title,
    company: "",
    location: online && !place ? "Online" : place,
    remote: online && !place,
    description: [text(e.description, 200), credit].filter(Boolean).join(" "),
    tags: kw.map((k) => clean(k, 40)).filter(Boolean).slice(0, 8),
    applyUrl: url,
    employerSite: false,
    kind: "event",
    attributes: { startDate: next.begin, ...(next.end ? { endDate: next.end } : {}), ...(zone ? { timezone: zone } : {}), online, ...(city ? { city } : {}), ...(e.status === 6 ? { cancelled: true } : {}) },
  };
}

const keepAgendas = (json: unknown): OaAgenda[] => {
  const j = json as { agendas?: unknown } | null;
  if (!j || typeof j !== "object" || !Array.isArray(j.agendas)) throw new Error("OpenAgenda answered something that isn't its list of agendas.");
  return j.agendas as OaAgenda[];
};
const keepEvents = (json: unknown): OaEvent[] => {
  const j = json as { events?: unknown } | null;
  if (!j || typeof j !== "object" || !Array.isArray(j.events)) throw new Error("OpenAgenda answered something that isn't its list of events.");
  return j.events as OaEvent[];
};

/** One search: the matching official agendas, then their upcoming events. Throws what the caller turns into a source line. */
export async function openAgendaSearch(s: { id: string; name: string; limits: { timeoutMs: number } }, c: SearchCriteria, needsSetup: (m: string) => Error): Promise<{ jobs: Job[]; warnings: string[] }> {
  const key = platformKey(OPENAGENDA_KEY);
  if (!key) throw needsSetup(`${s.name} needs ${OPENAGENDA_KEY} on this deployment.`);
  const words = [c.query.trim(), c.locations[0]?.split(",")[0]?.trim() ?? ""].filter(Boolean).join(" ").slice(0, 120);
  // No default in place of intent: OpenAgenda is searched by what the person typed.
  if (!words) return { jobs: [], warnings: [`${s.name} is searched by words or a place; type one to see its events.`] };
  try {
    return await read(s, c, key, words);
  } catch (e) {
    // Never the key or the URL: a refusal says so, and the admin's Keys Test says more.
    if (e instanceof Error && /refused the request/.test(e.message)) throw needsSetup(`${s.name} refused the key on this deployment (check ${OPENAGENDA_KEY}).`);
    throw e;
  }
}

async function read(s: { id: string; limits: { timeoutMs: number } }, c: SearchCriteria, key: string, words: string): Promise<{ jobs: Job[]; warnings: string[] }> {
  const headers = { key };
  const o = { ttlMs: 3_600_000, timeoutMs: s.limits.timeoutMs, name: "OpenAgenda", headers };
  const agendas = (await readFeed(`${API}/agendas?${new URLSearchParams({ official: "1", size: String(AGENDAS), search: words })}`, { ...o, keep: keepAgendas })).filter((a) => a.uid !== undefined);
  const q = new URLSearchParams({ size: String(EVENTS), detailed: "1", monolingual: "en", sort: "timings.asc" });
  q.append("relative[]", "upcoming");
  const lists = await Promise.all(agendas.map(async (a) => ({ a, events: await readFeed(`${API}/agendas/${encodeURIComponent(String(a.uid))}/events?${q}`, { ...o, keep: keepEvents }) })));
  const seen = new Set<string>();
  const raws: RawPosting[] = [];
  for (const { a, events } of lists) {
    for (const e of events) {
      const raw = toRawEvent(e, a);
      if (!raw || seen.has(raw.externalId)) continue;
      seen.add(raw.externalId);
      raws.push(raw);
    }
  }
  return { jobs: finish(s.id, raws, c), warnings: [] };
}
