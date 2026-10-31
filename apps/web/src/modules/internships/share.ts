import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { durationLabel, SCHEDULE_LABEL, shortDate, stipendLabel, WORK_MODE_LABEL, type InternshipListing } from "./domain";

/**
 * What Share sends about an internship, everything the listing shows as it reads now: company, place, stipend,
 * duration, start and last day to apply, schedule, skills, where it came from, and its description. The link is its
 * public page (`/s/internships/<id>`), which carries the same and a button to the original posting.
 */
export const shareOf = (l: InternshipListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "internships",
    noun: "internship",
    title: l.title,
    facts: [l.company, l.workMode === "remote" ? WORK_MODE_LABEL.remote : shortPlace(l.location), t.stipendMin !== undefined || t.stipendMax !== undefined ? stipendLabel(t) : null],
    lines: [
      l.location && l.workMode !== "remote" && `Where: ${[l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null].filter(Boolean).join(" · ")}`,
      t.durationMonths && `Duration: ${durationLabel(t)}`,
      t.startsOn && `Starts: ${shortDate(t.startsOn)}`,
      t.applyBy && `Apply by: ${shortDate(t.applyBy)}`,
      t.schedule && `Schedule: ${SCHEDULE_LABEL[t.schedule]}`,
      l.skills.length > 0 && `Skills: ${l.skills.join(", ")}`,
      l.sourceName && `From: ${l.sourceName}${l.origin === "wonderstar" && !l.companyVerified ? " (company not verified yet)" : ""}`,
    ],
    details: l.description,
    url: publicPath("internships", l.id),
    source: l.sourceName,
    originalUrl: l.origin === "outside" ? l.applyUrl : undefined,
  };
};
