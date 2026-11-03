import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { LANE_LABEL, materialsLabel, priceLabel, ratingLabel, turnaroundLabel, visitLabel, warrantyLabel, type ServiceListing } from "./domain";

/** The sites an outside pro's page can be on, in the words of the link ("Their page on Houzz"); a business's own site is "Their website". */
const SITES: [RegExp, string][] = [[/(^|\.)houzz\.in$/, "Houzz"], [/(^|\.)wedmegood\.com$/, "WedMeGood"], [/(^|\.)freelancer\.com$/, "Freelancer.com"], [/(^|\.)openstreetmap\.org$/, "OpenStreetMap"]];
export function originalLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    const site = SITES.find(([re]) => re.test(host));
    return site ? `Their ${site[1] === "Freelancer.com" ? "profile" : "page"} on ${site[1]}` : "Their website";
  } catch {
    return "Their page";
  }
}

/** Whether the listing is named for the business itself (a directory entry), so its name needn't be said twice. */
export const sameName = (l: Pick<ServiceListing, "title" | "company">) => l.title.trim().toLowerCase() === l.company.trim().toLowerCase();

/**
 * What Share sends about a pro's service, everything the listing shows as it reads now: who, price, whether it is local
 * or remote, the areas served, visit charge, materials, warranty, turnaround, skills, rating and finished jobs where
 * the source reports them, GST, and the description. The link is its public page (`/s/services/<id>`).
 */
const priceStated = (t: ServiceListing["terms"]) => t.priceKind === "quote" || t.priceMin !== undefined || t.priceMax !== undefined;

export const shareOf = (l: ServiceListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "services",
    noun: "service",
    title: l.title,
    // An unstated price isn't a headline fact: it would take the highlighted chip on the image for nothing.
    facts: [l.company, priceStated(t) ? priceLabel(t) : null, t.lane === "local" ? shortPlace(l.location) : t.lane ? LANE_LABEL[t.lane] : null],
    // Most telling first: the share image shows only the first four rows beside the summary.
    lines: [
      t.category && `Category: ${t.category}`,
      t.areas?.length && `Areas: ${t.areas.join(", ")}`,
      ratingLabel(t) && `Rating: ${ratingLabel(t)}`,
      t.skills?.length && `Skills: ${t.skills.join(", ")}`,
      t.completed && `Jobs finished: ${t.completed}${t.onTimePct !== undefined ? ` · ${t.onTimePct}% on time` : ""}`,
      visitLabel(t),
      materialsLabel(t.materials),
      warrantyLabel(t.warrantyDays),
      turnaroundLabel(t.turnaroundDays),
      t.gst && "GST registered",
      t.lane && `Kind: ${LANE_LABEL[t.lane]}`,
      l.sourceName && `From: ${l.sourceName}${l.origin === "wonderstar" && !l.companyVerified ? " (pro not verified yet)" : ""}`,
    ],
    details: l.description,
    url: publicPath("services", l.id),
    source: l.sourceName,
    ...(l.origin === "outside" ? { originalUrl: l.applyUrl, ...(l.applyUrl ? { originalLabel: originalLabel(l.applyUrl) } : {}), ...(l.attribution ? { credit: l.attribution } : {}) } : {}),
  };
};
