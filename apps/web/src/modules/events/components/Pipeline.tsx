"use client";
import { useEffect, useState } from "react";
import type { Tone } from "@/components/common/Badge";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { CalendarSubscribe } from "@/components/calendar/CalendarSubscribe";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { StageCard, StageEmpty, StageList, StageTiles } from "@/wonderworks/pipeline/parts";
import { Cover } from "./Cover";
import { STAGE_OF, STATUS_LABEL, hasStarted, whenLabel, type MyRsvp, type RsvpStatus } from "../domain";
import { eventsManifest } from "../manifest";
import { useEventsStore } from "../store";
import { EVENTS_OUTSIDE } from "../outside";
import { listingHref } from "../manifest";
import type { EventListing } from "../domain";
import { useTracked } from "@/wonderworks/pipeline/tracked";

export const itemHref = (id: string) => `/app/m/events/pipeline/${encodeURIComponent(id)}`;
export const TONE: Record<RsvpStatus, Tone> = { going: "brand", waitlist: "info", attended: "success", no_show: "neutral", cancelled: "neutral" };

/** One line for where an RSVP stands. */
export const lineOf = (r: Pick<MyRsvp, "status" | "startsAt" | "place" | "online" | "location">) =>
  `${whenLabel(r.startsAt)}${r.status === "waitlist" && r.place ? ` · place ${r.place} on the waitlist` : ""} · ${r.online ? "Online" : r.location || "Place to be confirmed"}`;

/** The person's RSVPs, fetched once on open (nothing else runs). Also brings each event's "going" mark up to date. */
export function useMyRsvps() {
  const [list, setList] = useState<MyRsvp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ rsvps: MyRsvp[] }>("/api/m/events/rsvps")
      .then((r) => {
        setList(r.rsvps);
        const st = useEventsStore.getState();
        const seen = new Set<string>();
        for (const q of r.rsvps) {
          const id = `ws_${q.listingId}`;
          if (seen.has(id)) continue;
          seen.add(id);
          if (st.responses[id]?.status !== q.status) st.setResponse(id, STAGE_OF[q.status], { status: q.status });
        }
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return { list, error, reload: () => (setError(null), void load()) };
}

/**
 * My events, Events' Pipeline tab: Going · Waitlist · Attended as tiles with counts, from the person's own RSVPs on the
 * server, and the Calendar section: the events they're going to, with the same calendar subscription Jobs uses (the feed
 * carries them with their interviews and follow-ups). Cancelled and no-show end under Attended with their own badge.
 */
export function EventsPipeline() {
  const stages = eventsManifest.pipeline.stages;
  const { list, error, reload } = useMyRsvps();
  const [tab, setTab] = useState<string | null>(null);
  // Outside events the person is tracking themselves (wonderworks/listing/progress.ts).
  const tracked = useTracked<EventListing>(useEventsStore, EVENTS_OUTSIDE, (_id, l) => !!l.outside);

  if (error) return <ErrorState title="Couldn't load your events" body={error} actions={[{ label: "Try again", onClick: reload }]} />;
  if (!list) return <PageLoading rows={3} />;

  const count = (stage: string) => list.filter((r) => STAGE_OF[r.status] === stage).length + tracked.filter((t) => t.stage === stage).length;
  const current = tab ?? stages.find((s) => count(s.id))?.id ?? stages[0].id;
  const label = stages.find((s) => s.id === current)!.label;
  const shown = list.filter((r) => STAGE_OF[r.status] === current);
  const shownTracked = tracked.filter((t) => t.stage === current);
  const upcoming = [
    ...list.filter((r) => r.status === "going" && !hasStarted(r.startsAt)).map((r) => ({ id: r.id, title: r.title, startsAt: r.startsAt })),
    ...tracked.filter((t) => t.stage === "going" && !hasStarted(t.item.terms.startsAt)).map((t) => ({ id: t.id, title: t.item.title, startsAt: t.item.terms.startsAt })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div>
      <PageHeader title={eventsManifest.pipeline.label} />
      {list.length === 0 && tracked.length === 0 ? (
        <EmptyState title="No events yet" body="RSVP to an event on WonderWorks, or keep track of one you registered for on its organiser's page: it shows here." action={{ label: "Find an event", href: "/app/m/events" }} />
      ) : (
        <>
          <section aria-label="My events">
            <StageTiles label="Events by stage" stages={stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} current={current} onPick={setTab} />
            {shown.length === 0 && shownTracked.length === 0 ? (
              <StageEmpty label={label} />
            ) : (
              <StageList label={label}>
                {shown.map((r) => (
                  <li key={r.id}>
                    <StageCard cover={<Cover postingId={r.listingId} cover={r.cover} place="stage" />} href={itemHref(r.id)} logo={{ name: r.organiser }} company={r.organiser} title={r.title} line={lineOf(r)} tags={[]} badge={{ label: STATUS_LABEL[r.status], tone: TONE[r.status] }} when={whenLabel(r.startsAt)} />
                  </li>
                ))}
                {shownTracked.map((t) => (
                  <li key={t.id}>
                    <StageCard href={listingHref(t.id)} logo={{ name: t.item.company }} company={t.item.company} title={t.item.title} line={`${whenLabel(t.item.terms.startsAt)} · ${t.item.workMode === "remote" ? "Online" : t.item.location || "Place not stated"}`} tags={["Outside WonderWorks"]} badge={{ label: t.label, tone: "neutral" }} when={whenLabel(t.item.terms.startsAt)} />
                  </li>
                ))}
              </StageList>
            )}
          </section>
          <section aria-label="Calendar" className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Calendar</h2>
              <CalendarSubscribe />
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-3">Events you&apos;re going to appear here and in your calendar feed.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
                {upcoming.map((r) => (
                  <li key={r.id} className="px-4 py-2.5 text-[14px]">
                    <span className="font-medium text-ink">{whenLabel(r.startsAt)}</span> <span className="text-ink-3">· {r.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
