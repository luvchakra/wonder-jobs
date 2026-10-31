import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { LANE_LABEL, materialsLabel, priceLabel, ratingLabel, turnaroundLabel, visitLabel, warrantyLabel, type ServiceListing } from "./domain";

/**
 * What Share sends about a pro's service, everything the listing shows as it reads now: who, price, whether it is local
 * or remote, the areas served, visit charge, materials, warranty, turnaround, skills, rating and finished jobs where
 * the source reports them, GST, and the description. The link is its public page (`/s/services/<id>`).
 */
export const shareOf = (l: ServiceListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "services",
    noun: "service",
    title: l.title,
    facts: [l.company, priceLabel(t), t.lane === "local" ? shortPlace(l.location) : t.lane ? LANE_LABEL[t.lane] : null],
    lines: [
      t.lane && `Kind: ${LANE_LABEL[t.lane]}`,
      t.category && `Category: ${t.category}`,
      t.areas?.length && `Areas: ${t.areas.join(", ")}`,
      visitLabel(t),
      materialsLabel(t.materials),
      warrantyLabel(t.warrantyDays),
      turnaroundLabel(t.turnaroundDays),
      t.skills?.length && `Skills: ${t.skills.join(", ")}`,
      ratingLabel(t) && `Rating: ${ratingLabel(t)}`,
      t.completed && `Jobs finished: ${t.completed}${t.onTimePct !== undefined ? ` · ${t.onTimePct}% on time` : ""}`,
      t.gst && "GST registered",
      l.sourceName && `From: ${l.sourceName}${l.origin === "wonderstar" && !l.companyVerified ? " (pro not verified yet)" : ""}`,
    ],
    details: l.description,
    url: publicPath("services", l.id),
    source: l.sourceName,
    originalUrl: l.origin === "outside" ? l.applyUrl : undefined,
  };
};
