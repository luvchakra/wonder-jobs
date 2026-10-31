"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { findListing } from "@/wonderworks/store";
import { ClampedText, isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ageLabel, seatsLabel, whenLabel, type EventListing } from "../domain";
import { useEventsStore } from "../store";
import { fitOf, useMatch } from "./Listing";
import { Rsvp } from "./Rsvp";
import { shareOf } from "../share";

const noop = () => () => undefined;
const FIND = { href: "/app/m/events", label: "Events" };

/**
 * One event's own page, on WonderWorks' listing page (wonderworks/listing/): the head and whether it fits your interests
 * and city, About in the organiser's words, then the Details and Source folds. It shows how many seats are left, never who
 * is going. Shown from what the person saw: their saves, else their last search in this visit.
 */
export function EventPage({ id }: { id: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const l = useEventsStore((s) => findListing(s, id)) as EventListing | undefined;
  if (!mounted) return <PageLoading rows={3} />;
  if (!l)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={FIND} title="Event not found" />
        <EmptyState title="This event isn't in your results" body="It may have left your last search. Search again to find it." action={{ label: "Back to Events", href: FIND.href }} />
      </div>
    );
  return <Page l={l} />;
}

function Page({ l }: { l: EventListing }) {
  const params = useSearchParams();
  const saved = useEventsStore((s) => !!s.saved[l.id]);
  const toggle = useEventsStore((s) => s.toggleSaved);
  const m = useMatch(l);
  const fit = fitOf(m);
  const long = isLongText(l.description);
  const [expanded, setExpanded] = useState(false);
  const t = l.terms;
  const rows: [string, string][] = [
    ["When", `${whenLabel(t.startsAt)} (IST)`],
    ...(t.endsAt ? ([["Ends", `${whenLabel(t.endsAt)} (IST)`]] as [string, string][]) : []),
    ["Where", t.online ? "Online" : l.location],
    ["Seats", seatsLabel(l)],
    ["Price", "Free"],
    ["Minimum age", ageLabel(t) ?? "None stated"],
    ["Kind", t.tags.length ? t.tags.join(", ") : "Not stated"],
  ];
  return (
    <ListingPage
      share={shareOf(l)}
      back={FIND}
      title={l.title}
      actions={
        <Button variant="outline" size="sm" icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden />} aria-pressed={saved} onClick={() => toggle(l.id, l)}>
          {saved ? "Saved" : "Save"}
        </Button>
      }
    >
      <ListingMain>
        <ListingHead
          company={l.company}
          name={l.company}
          facts={[
            <span key="w" className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {whenLabel(t.startsAt)}
            </span>,
            <span key="l" className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {t.online ? "Online" : l.location}
            </span>,
            <span key="s" className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden /> {seatsLabel(l)}
            </span>,
            <span key="$">Free</span>,
          ]}
        />
        {fit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
              {fit.label}
            </span>
          </div>
        )}
        <h2 className="mt-4 text-[15px] font-semibold text-ink">From the organiser</h2>
        <ClampedText text={l.description || "The organiser shares no description."} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            {m.signals.length === 0 && (
              <p className="text-sm text-ink-3">
                Save your interests and city in <Link href="/app/m/events/you/profile" className="font-medium text-brand-600 hover:underline">Events → You</Link> to see how it compares.
              </p>
            )}
            <Fold title="Details" hint={[whenLabel(t.startsAt), seatsLabel(l)].join(" · ")}>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-4">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] text-ink-4">As {l.company} posted it on WonderWorks. Times are India time. You see how many seats are left, never who is going.</p>
            </Fold>
            <Fold title="Source" hint={`Via ${l.sourceName}`}>
              <p className="text-[13px] text-ink-2">Posted on WonderWorks by {l.company}.{l.postedAt ? ` Updated ${relativeTime(l.postedAt)}.` : ""}</p>
            </Fold>
          </div>
        )}
      </ListingMain>
      <ListingAside>
        <Rsvp listing={l} start={params.get("rsvp") === "1"} />
      </ListingAside>
    </ListingPage>
  );
}
