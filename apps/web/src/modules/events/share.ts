import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { ageLabel, seatsLabel, whenLabel, type EventListing } from "./domain";

/**
 * What Share sends about an event, everything the listing shows as it reads now: when it starts and ends, where (or
 * online), who runs it, the seats left right now, the age limit, what kind of event it is and its description. The link
 * is its public page (`/s/events/<id>`).
 */
export const shareOf = (l: EventListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "events",
    noun: "event",
    title: l.title,
    facts: [whenLabel(t.startsAt), t.online ? "Online" : shortPlace(l.location), l.company],
    lines: [
      t.endsAt && `Ends: ${whenLabel(t.endsAt)}`,
      !t.online && l.location && `Where: ${l.location}`,
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
