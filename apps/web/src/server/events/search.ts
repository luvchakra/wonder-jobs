/**
 * Events Find: one search of WorksLake's Events dataset (module = 'events'), turned into events with their terms and the
 * seats left, and the per-source provenance the person sees ("searched X across Y").
 */
import { search } from "@/server/jobslake/core";
import { EVENTS, seatsLeft, type EventListing } from "@/modules/events/domain";
import { openEventPosts, seatCounts } from "./listings";
import { dedupeOutside, isOutsideEvent, toOutsideEvent } from "./outside";
import { WONDERWORKS_EVENTS } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface EventsSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface EventsSearchResult {
  searched: { query: string; places: string[] };
  results: EventListing[];
  sources: EventsSourceLine[];
}

const MAX_RESULTS = 200;

/** A WonderWorks organiser's open event as Find and its public page list it: with the terms they gave and the seats left now. */
export function wonderworksEvent({ posting, org }: Awaited<ReturnType<typeof openEventPosts>>[number], c: { going: number; waiting: number }, sourceName: string): EventListing {
  return { id: `ws_${posting.id}`, postingId: posting.id, title: posting.title, company: org.name, location: posting.location, workMode: posting.workMode, terms: posting.terms, description: posting.description.slice(0, 4000), seatsLeft: seatsLeft(posting.terms.capacity, c.going), waitlisted: c.waiting, postedAt: posting.updatedAt, sourceId: WONDERWORKS_EVENTS, sourceName };
}

/** Search events for these words and places. They are the person's own; there is no default. */
export async function searchEvents(input: { query: string; places: string[]; refresh?: boolean }): Promise<EventsSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: EVENTS, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openEventPosts(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const hits = response.results.flatMap((o) => {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERWORKS_EVENTS);
    // Only an event that is still open and hasn't started is shown, with the terms the organiser gave.
    const p = ws ? byPosting.get(ws.sourceJobId) : undefined;
    return ws && p ? [{ ws, ...p }] : [];
  });
  // Seats are counted live, per event: a number, never who is going.
  const seats = await seatCounts(hits.map((h) => h.posting.id));
  const results: EventListing[] = hits.map(({ ws, ...p }) => wonderworksEvent(p, seats.get(p.posting.id) ?? { going: 0, waiting: 0 }, ws.sourceName));
  // Outside events (WorksLake's other Events sources, e.g. the gateway's conferences), beside the ones organised here. WorksLake's
  // own per-source lines below say what each source gave, or that it needs setup or is unavailable.
  // The same event can come from two sources (a conference in confs.tech and developers.events): listed once, from the first.
  const outside = dedupeOutside(response.results.filter(isOutsideEvent).flatMap((o) => toOutsideEvent(o) ?? []));
  results.push(...outside.slice(0, Math.max(0, MAX_RESULTS - results.length)));
  const lines: EventsSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
