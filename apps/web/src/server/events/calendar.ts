/**
 * Events on the calendar the person already has (docs/WONDERWORKS_PLATFORM.md §4: reuse Jobs' calendar and reminders):
 * - the signed .ics feed (app/api/calendar/[tenantId]/[signature]) carries the events they're going to, with their
 *   interviews and follow-ups;
 * - the reminder pass (server/workflow/reminderPass.ts) tells them a day before, once per RSVP, in the Events bell.
 * Both read only this person's own RSVPs (responder_tenant) and only events that haven't started.
 */
import type { IcsEvent } from "../ics";
import { deliver } from "../notifications/deliver";
import { events as history, listings, record, responses as allResponses } from "../modules/responses";
import { EVENTS, readTerms, whenLabel, type RsvpStatus } from "@/modules/events/domain";

const DAY = 86_400_000;
const responses = () => allResponses<RsvpStatus, unknown>();

/** The events this person is going to that haven't started, as calendar entries (default two hours when no end is set). */
export async function goingEvents(tenantId: string, origin: string, now = Date.now()): Promise<IcsEvent[]> {
  const mine = (await responses().find({ responder_tenant: tenantId, module: EVENTS, status: "going" }, { limit: 300 }));
  if (!mine.length) return [];
  const posts = await listings().findIn("id", [...new Set(mine.map((r) => r.listing_id))], { module: EVENTS });
  return posts.flatMap((p) => {
    const t = readTerms(p.attrs);
    if (Date.parse(t.startsAt) <= now) return [];
    const minutes = t.endsAt ? Math.max(15, Math.round((Date.parse(t.endsAt) - Date.parse(t.startsAt)) / 60_000)) : 120;
    return [{ uid: `event-${p.id}`, start: new Date(t.startsAt), durationMinutes: minutes, summary: p.title, description: `${t.online ? "Online" : p.location}. You're going (WonderWorks Events).`, url: `${origin}/app/m/events/pipeline` }];
  });
}

export interface EventReminderReport {
  raised: number;
  failures: number;
}

/**
 * Remind each person a day before an event they're going to, once per RSVP (a `reminder:day` line in its history is the
 * idempotency key). Reads open events starting in the next day, then only the going RSVPs of those. Never throws for one
 * person: the rest still get theirs.
 */
export async function runEventReminders(now: Date, deadline: number): Promise<EventReminderReport> {
  const report: EventReminderReport = { raised: 0, failures: 0 };
  const open = await listings().find({ module: EVENTS, status: "open" }, { order: "updated_at", desc: true, limit: 500 });
  const soon = open.filter((l) => {
    const at = Date.parse(readTerms(l.attrs).startsAt);
    return at > now.getTime() && at <= now.getTime() + DAY;
  });
  for (const l of soon) {
    for (const r of await responses().find({ listing_id: l.id, org_id: l.org_id, module: EVENTS, status: "going" })) {
      if (Date.now() > deadline) return report;
      try {
        if ((await history().find({ response_id: r.id, org_id: r.org_id, event: "reminder:day" }, { limit: 1 })).length) continue;
        // Recorded first: a reminder that can't be sent is not retried every hour, and one that is sent is never sent twice.
        await record(r, "reminder:day", "system");
        const t = readTerms(l.attrs);
        await deliver(r.responder_tenant, { category: "application_status", module: EVENTS, title: "An event is coming up", body: `${l.title} · ${whenLabel(t.startsAt)} (IST)${t.online ? "" : ` · ${l.location}`}.`, href: "/app/m/events/pipeline", action: "Open My events" }, { email: { key: `event-reminder-${r.id}` } }, now);
        report.raised++;
      } catch {
        report.failures++;
      }
    }
  }
  return report;
}
