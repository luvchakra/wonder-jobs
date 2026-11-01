"use client";
import { memo } from "react";
import Link from "next/link";
import { shortPlace } from "@/wonderworks/find/place";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { Badge } from "@/components/common/Badge";
import { CompanyLogo } from "@/components/common/Avatar";
import { relativeTime } from "@/lib/format";
import { ageLabel, matchEvent, outsidePlace, seatsLabel, whenLabel, whenOf, type EventListing, type EventMatch } from "../domain";
import { listingHref } from "../manifest";
import { selectPersona, useEventsStore } from "../store";
import { Cover } from "./Cover";
import { isLive } from "./Rsvp";
import { shareOf } from "../share";

export function useMatch(l: EventListing): EventMatch {
  return matchEvent(l, useEventsStore(selectPersona));
}

/** "Fits you" under the logo, in the pill Jobs uses for its match: only from the interests and city the person saved. */
export const fitOf = (m: EventMatch) => (m.signals.length === 0 ? null : m.score === m.signals.length ? { top: "Fits", bottom: "you", label: "Fits your interests and city", tone: "bg-success-100 text-success-600", title: "Matches the interests and city you saved" } : m.score > 0 ? { top: "Partly", bottom: "fits", label: "Partly fits you", tone: "bg-brand-50 text-brand-700", title: "Matches some of what you saved" } : null);

/**
 * One event in the results, on the card Jobs' Find uses (wonderworks/find/parts.tsx): the organiser's logo with whether it
 * fits your interests and city; the name; when · where · seats left · Free; kinds; what the organiser wrote, labelled as
 * theirs; where it was found, and Save. Never who else is going.
 */
export const EventCard = memo(function EventCard({ item: l, onOpen }: { item: EventListing; onOpen: (id: string) => void }) {
  const saved = useEventsStore((s) => !!s.saved[l.id]);
  const toggle = useEventsStore((s) => s.toggleSaved);
  const going = useEventsStore((s) => isLive(s, l.id));
  const m = useMatch(l);
  const fit = fitOf(m);
  const t = l.terms;
  const out = l.outside;
  return (
    <ResultCard
      cover={out ? undefined : <Cover postingId={l.postingId} cover={t.cover} place="card" />}
      share={shareOf(l)}
      aside={
        <>
          <CompanyLogo name={l.company || l.sourceName} logo size={44} />
          {fit && <FitPill tone={fit.tone} title={fit.title} top={fit.top} bottom={fit.bottom} srText={fit.title} />}
          {out && (
            // The event's own page: nothing is RSVPed here, so the one action is going there.
            <a href={out.url} target="_blank" rel="noopener noreferrer" aria-label={`Event page for ${l.title} (opens the source's page)`} title="Event page" className={APPLY_BTN}>
              Event page
            </a>
          )}
          {!out && !going && (
            <Link href={`${listingHref(l.id)}?rsvp=1`} onClick={() => onOpen(l.id)} aria-label={`RSVP to ${l.title}`} title="RSVP" className={APPLY_BTN}>
              {t.capacity !== undefined && !l.seatsLeft ? "Waitlist" : "RSVP"}
            </Link>
          )}
        </>
      }
      title={
        <Link href={listingHref(l.id)} onClick={() => onOpen(l.id)} className={CARD_TARGET}>
          {l.title}
        </Link>
      }
      facts={
        out
          ? [
              <span key="w" className="font-medium text-ink-2">
                {whenOf(l)}
              </span>,
              <span key="p" title={l.location}>{outsidePlace(l)}</span>,
              l.company && <span key="c">{l.company}</span>,
            ]
          : [
              <span key="w" className="font-medium text-ink-2">
                {whenLabel(t.startsAt)}
              </span>,
              <span key="p" title={l.location}>{t.online ? "Online" : shortPlace(l.location)}</span>,
              <span key="c">{l.company}</span>,
              <span key="s">{seatsLabel(l)}</span>,
              <span key="$">Free</span>,
              ageLabel(t) && <span key="a">{ageLabel(t)}</span>,
            ]
      }
      tags={t.tags.slice(0, 3)}
      reasons={m.signals.filter((x) => x.met).map((x) => x.label).slice(0, 2)}
      summary={l.description.slice(0, 240)}
      summaryTitle={out ? "From the source" : "From the organiser"}
      status={going && <Badge tone="brand">{useEventsStore.getState().responses[l.id]?.status === "waitlist" ? "On the waitlist" : "Going"}</Badge>}
      footnote={`via ${l.sourceName}${l.postedAt ? ` · ${relativeTime(l.postedAt)}` : ""}`}
      actions={<SaveButton saved={saved} onToggle={() => toggle(l.id, l)} noun="event" />}
    />
  );
});
