import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { gradesLabel, HOURS_LABEL, payLabel, WORK_MODE_LABEL, type TeachingListing } from "./domain";

/**
 * What Share sends about a teaching job, everything the listing shows as it reads now: school, place, hours, subject,
 * grades, boards, pay, what the post asks the teacher to hold, whether a demo class is part of hiring, and its
 * description. The link is its public page (`/s/teaching/<id>`).
 */
export const shareOf = (l: TeachingListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "teaching",
    noun: "teaching job",
    title: l.title,
    facts: [l.company, l.workMode === "remote" ? WORK_MODE_LABEL.remote : shortPlace(l.location), t.hours ? HOURS_LABEL[t.hours] : null],
    lines: [
      l.location && l.workMode !== "remote" && `Where: ${[l.location, l.workMode ? WORK_MODE_LABEL[l.workMode] : null].filter(Boolean).join(" · ")}`,
      t.subject && `Subject: ${t.subject}`,
      t.grades?.length && `Grades: ${gradesLabel(t.grades)}`,
      t.boards?.length && `Boards: ${t.boards.join(", ")}`,
      (t.payMin !== undefined || t.payMax !== undefined) && `Pay: ${payLabel(t)}`,
      t.requires?.length && `Requires: ${t.requires.join(", ")}`,
      t.demo && "A demo class is part of hiring",
      l.sourceName && `From: ${l.sourceName}${l.origin === "wonderstar" && !l.companyVerified ? " (school not verified yet)" : ""}`,
    ],
    details: l.description,
    url: publicPath("teaching", l.id),
    source: l.sourceName,
    originalUrl: l.origin === "outside" ? l.applyUrl : undefined,
  };
};
