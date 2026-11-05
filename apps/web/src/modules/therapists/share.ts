import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { feeLabel, lengthLabel, modesLabel, type TherapistListing } from "./domain";

/**
 * What Share sends about a practitioner, everything the listing shows as it reads now: who, how they meet, fee, session
 * length, languages, focus areas, ways of working and their description. It is what the practitioner chose to publish
 * in WonderWorks' directory (no clinical data is ever held here). The link is its public page (`/s/therapists/<id>`).
 */
export const shareOf = (l: TherapistListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "therapists",
    noun: "practitioner",
    title: l.title,
    // A mapped practice has no fee or way of meeting on the map, so it shares who, where and what kind; never "Fee not stated".
    facts: [l.company, t.modes?.includes("in_person") ? shortPlace(l.location) : null, l.origin === "outside" ? l.practiceKind : modesLabel(t.modes), l.origin === "outside" ? null : feeLabel(t)],
    lines: [
      lengthLabel(t.sessionMinutes) && `Session: ${lengthLabel(t.sessionMinutes)}`,
      t.languages?.length && `Languages: ${t.languages.join(", ")}`,
      t.focus?.length && `Focus: ${t.focus.join(", ")}`,
      t.approaches?.length && `Ways of working: ${t.approaches.join(", ")}`,
    ],
    details: l.description,
    // Map data keeps its credit wherever it is shown, the public page included (ODbL); it is its own field, so it never counts as the description.
    ...(l.origin === "outside" ? { originalLabel: "Their page on OpenStreetMap", ...(l.attribution ? { credit: l.attribution } : {}) } : {}),
    url: publicPath("therapists", l.id),
    source: l.sourceName,
  };
};
