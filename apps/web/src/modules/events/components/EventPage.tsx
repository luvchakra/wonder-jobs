"use client";
import { TranslatedText } from "@/wonderworks/translate/TranslatedText";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, CalendarDays, Clock, ExternalLink, MapPin, Users } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { shortSourceNames } from "@/wonderworks/find/parts";
import { findListing } from "@/wonderworks/store";
import { isLongText, ListingAside, ListingHead, ListingMain, ListingPage } from "@/wonderworks/listing/ListingPage";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ageLabel, dateRangeLabel, outsidePlace, seatsLabel, whenLabel, whenOf, type EventListing } from "../domain";
import { useEventsStore } from "../store";
import { EVENTS_OUTSIDE } from "../outside";
import { OutsideTracker } from "@/wonderworks/listing/OutsideProgress";
import { fitOf, useMatch } from "./Listing";
import { Cover } from "./Cover";
import { Rsvp } from "./Rsvp";
import { shareOf } from "../share";

const noop = () => () => undefined;
const FIND = { href: "/app/m/events", label: "Events" };

/** The site an outside event's own page is on ("tapahtumat.hel.fi"), for the line under the Event page button. */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

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
  const out = l.outside;
  // Each fact once. An outside event's head already has its organiser, dates and place and the Source fold has its source, so
  // Details holds only what the head doesn't: its call for papers, as a link to where to answer it.
  const rows: [string, React.ReactNode][] = out
    ? out.cfpUrl
      ? [
          [
            "Call for papers",
            <a key="cfp" href={out.cfpUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              {out.cfpEndDate ? `Open until ${dateRangeLabel(out.cfpEndDate)}` : "Open"}
            </a>,
          ],
        ]
      : []
    : [
        ["When", `${whenLabel(t.startsAt)} (IST)`],
        ...(t.endsAt ? ([["Ends", `${whenLabel(t.endsAt)} (IST)`]] as [string, string][]) : []),
        ["Where", t.online ? "Online" : l.location],
        ["Seats", seatsLabel(l)],
        ["Price", "Free"],
        ["Minimum age", ageLabel(t) ?? "None stated"],
        ["Kind", t.tags.length ? t.tags.join(", ") : "Not stated"],
      ];
  const sourceShort = shortSourceNames(l.sourceName);
  return (
    <ListingPage
      report={{ module: "events", id: l.id }}
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
        {!out && <Cover postingId={l.postingId} cover={t.cover} place="page" alt={`Cover photo for ${l.title}`} />}
        <ListingHead
          company={l.company || l.title}
          domain={l.companyDomain}
          name={l.company}
          // An outside event that names no organiser has no organiser line (never the source's name), and a calendar tile when it has no site to take a logo from.
          hideName={!l.company}
          icon={!l.company && !l.companyDomain ? <CalendarDays className="size-5" aria-hidden /> : undefined}
          facts={[
            <span key="w" className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {out ? whenOf(l) : whenLabel(t.startsAt)}
            </span>,
            <span key="l" className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {out ? outsidePlace(l) : t.online ? "Online" : l.location}
            </span>,
            !out && (
              <span key="s" className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden /> {seatsLabel(l)}
              </span>
            ),
            !out && <span key="$">Free</span>,
          ]}
        />
        {fit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span title={fit.title} className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold", fit.tone)}>
              {fit.label}
            </span>
          </div>
        )}
        <TranslatedText id={l.id} title={l.title} heading={out ? "From the source" : "From the organiser"} text={l.description || (out ? "The source gives no description." : "The organiser shares no description.")} long={long} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
        {(expanded || !long) && (
          <div className="mt-3 flex min-w-0 flex-col gap-3">
            {m.signals.length === 0 && (
              <p className="text-sm text-ink-3">
                Save your interests and city in <Link href="/app/m/events/you/profile" className="font-medium text-brand-600 hover:underline">Events → You</Link> to see how it compares.
              </p>
            )}
            {rows.length > 0 && (
              <Fold title="Details" hint={out ? "Call for papers" : [whenLabel(t.startsAt), seatsLabel(l)].join(" · ")}>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {rows.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-ink-4">{k}</dt>
                      <dd className="font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {!out && <p className="mt-3 text-[12px] text-ink-4">{`As ${l.company} posted it on WonderWorks. Times are India time. You see how many seats are left, never who is going.`}</p>}
              </Fold>
            )}
            <Fold title="Source" hint={out ? `Via ${sourceShort}` : `Via ${l.sourceName}`}>
              <p className="text-[13px] text-ink-2">
                {out ? (
                  <>
                    Listed from <span title={sourceShort !== l.sourceName ? l.sourceName : undefined} className="font-medium text-ink">{sourceShort}</span>, an outside source. Its dates, place and description are as it states them; WonderWorks adds nothing and doesn&apos;t organise this event. Its own page for the event is where anything further happens; there is no RSVP here.
                  </>
                ) : (
                  `Posted on WonderWorks by ${l.company}.${l.postedAt ? ` Updated ${relativeTime(l.postedAt)}.` : ""}`
                )}
              </p>
            </Fold>
          </div>
        )}
      </ListingMain>
      <ListingAside>
        {out ? (
          <>
            <a href={out.url} target="_blank" rel="noopener noreferrer" className="wj-gradient-bg wj-press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold text-white">
              <ExternalLink className="size-4" aria-hidden /> Event page
            </a>
            <p className="text-center text-[12px] text-ink-3">Opens the event&apos;s own page{siteOf(out.url) ? ` on ${siteOf(out.url)}` : ""}. RSVP and seats are only for events posted on WonderWorks.</p>
            <OutsideTracker useStore={useEventsStore} id={l.id} item={l} flow={EVENTS_OUTSIDE} pipelineHref="/app/m/events/pipeline" />
          </>
        ) : (
          <Rsvp listing={l} start={params.get("rsvp") === "1"} />
        )}
      </ListingAside>
    </ListingPage>
  );
}
