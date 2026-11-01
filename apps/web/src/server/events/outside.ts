/**
 * Outside events in Events' Find: events WorksLake's own search returns for the Events module (kind "event", from a source
 * other than WonderWorks' own events: today the gateway's confs.tech conference data, `works_gateway_events`), shown beside
 * the events organisers post on WonderWorks. Events reads them through WorksLake like every module; the gateway is one
 * WorksLake source among others, and WorksLake's own per-source lines in the search say what each source gave.
 *
 * Real data only: each one carries exactly what its source states (`attributes`): its dates, its city and whether it can
 * be joined online, its own page and its source's name (which stays on the card and the page: the source's licence asks
 * for attribution). No organiser unless the source gives one; no price, seats, time of day or posting date is made up
 * (`postedAt` of an event is when WorksLake first saw it, never a posting date). An event whose dates can't be read, or
 * that has ended, is left out. There is no RSVP for one: it links to the event's own page.
 */
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { type EventListing } from "@/modules/events/domain";
import { todayIst } from "@/wonderworks/listing/terms";
import { WONDERWORKS_EVENTS } from "./sources";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isWeb = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
/** A bare host name ("devopsdays.org"), as WorksLake's employer.domain gives it; anything else is dropped, never guessed. */
const host = (v: unknown) => {
  const h = typeof v === "string" ? v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "";
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h) && h.length <= 120 ? h : undefined;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Whether WorksLake's result is an outside event for Events: an event listing that doesn't come from WonderWorks' own events. */
export const isOutsideEvent = (o: Pick<CanonicalOpportunity, "kind" | "sourceRecords">) => o.kind === "event" && o.sourceRecords.length > 0 && !o.sourceRecords.some((r) => r.sourceId === WONDERWORKS_EVENTS);

/** One WorksLake event as an Events listing, or null when it can't honestly be shown (no readable start date, no page, over). */
export function toOutsideEvent(o: CanonicalOpportunity, today = todayIst()): EventListing | null {
  const a = o.attributes ?? {};
  const source = o.sourceRecords[0];
  const startDate = a.startDate;
  if (!source || !isDay(startDate) || !isWeb(o.canonicalApplyUrl)) return null;
  const endDate = isDay(a.endDate) && a.endDate >= startDate ? a.endDate : undefined;
  // Only events that haven't ended (the source may keep one a day past its end).
  if ((endDate ?? startDate) < today) return null;
  const online = a.online === true;
  const city = text(a.city, 120) || text(o.locations[0], 120);
  const cfpUrl = isWeb(a.cfpUrl) ? a.cfpUrl : undefined;
  const cfpEndDate = cfpUrl && isDay(a.cfpEndDate) ? a.cfpEndDate : undefined;
  return {
    id: `ow_${o.id}`,
    postingId: o.id,
    title: text(o.title, 160),
    company: text(o.employer?.name, 160),
    // The event's own website, so its logo can be found (the company directory records events under that site).
    ...(host(o.employer?.domain) ? { companyDomain: host(o.employer?.domain) } : {}),
    location: city,
    workMode: online && !city ? "remote" : "onsite",
    // The start of that day in India time, only so events sort and filter by date; the day is all that is shown.
    terms: { startsAt: new Date(`${startDate}T00:00:00+05:30`).toISOString(), ...(endDate ? { endsAt: new Date(`${endDate}T23:59:00+05:30`).toISOString() } : {}), online: online && !city, tags: [] },
    description: text(o.description, 4000),
    waitlisted: 0,
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    outside: { url: o.canonicalApplyUrl, startDate, ...(endDate ? { endDate } : {}), online, ...(cfpUrl ? { cfpUrl } : {}), ...(cfpEndDate ? { cfpEndDate } : {}) },
  };
}
