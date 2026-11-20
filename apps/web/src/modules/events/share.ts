import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { shortSourceNames } from "@/wonderworks/find/sourceName";
import { ageLabel, dateRangeLabel, seatsLabel, sharePlace, whenLabel, type EventListing } from "./domain";

/**
 * A place short enough for a chip or the sheet's line (the share image clips a chip at about 34 characters): whole comma-separated parts while they fit, never a word cut in half
 * (a venue's full street address becomes its first parts), and "…" when even the first part is too long. The full place
 * stays in the message's "Where" line.
 */
export function cutPlace(place: string, max = 32): string {
  const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}, ${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const first = parts[0] ?? place.trim();
  const cut = first.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * What Share sends about an event, everything the listing shows as it reads now: when it starts and ends, where (or
 * online), who runs it, the seats left right now, the age limit, what kind of event it is and its description. The link
 * is its public page (`/s/events/<id>`).
 */
export const shareOf = (l: EventListing): ListingShareProps => {
  const t = l.terms;
  const out = l.outside;
  // An event from an outside source is shared with its dates, place and source; its public page here shows it as the
  // source lists it, with the event's own page as the original: nothing is said that its source didn't.
  if (out) {
    // The place as its source gives it (a venue's full address can be long), or Online; none when the source names none.
    const place = sharePlace(l);
    return {
      module: "events",
      noun: "event",
      title: l.title,
      // The organiser is always the last fact, empty when the source names none, so the image never mistakes the place for one.
      facts: [dateRangeLabel(out.startDate, out.endDate), place && cutPlace(place), l.company],
      lines: [place && cutPlace(place) !== place && `Where: ${place}`, `Source: ${shortSourceNames(l.sourceName)}`, out.cfpUrl && `Call for papers: ${out.cfpUrl}${out.cfpEndDate ? ` (until ${dateRangeLabel(out.cfpEndDate)})` : ""}`],
      details: l.description,
      url: publicPath("events", l.id),
      source: l.sourceName,
      originalUrl: out.url,
    };
  }
  return {
    module: "events",
    noun: "event",
    title: l.title,
    facts: [whenLabel(t.startsAt), t.online ? "Online" : cutPlace(shortPlace(l.location)), l.company],
    lines: [
      t.endsAt && `Ends: ${whenLabel(t.endsAt)}`,
      // Only when it adds to the chip (a street address the chip cut short); the same words twice add nothing.
      !t.online && l.location && cutPlace(shortPlace(l.location)) !== l.location && `Where: ${l.location}`,
      `Seats: ${seatsLabel(l)}`,
      ageLabel(t) && `Age: ${ageLabel(t)}`,
      "Free to join",
      t.tags.length > 0 && `Tags: ${t.tags.join(", ")}`,
    ],
    details: l.description,
    url: publicPath("events", l.id),
    source: l.sourceName,
  };
};
