import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { deadlineLabel, durationLabel, KIND_LABEL, levelsLabel, shortDate, valueLabel, WORK_MODE_LABEL, type MyScholarshipApplicationDetail, type ScholarshipListing } from "./domain";

/**
 * What Share sends about a scholarship or project: everything the listing shows as it reads now — provider or host,
 * award or stipend, deadline, levels, documents, where it came from and its description — never whether Wonder thinks
 * the student may be eligible. The link is its public page (`/s/scholarships/<id>`).
 */
export const shareOf = (l: ScholarshipListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "scholarships",
    noun: KIND_LABEL[t.kind].toLowerCase(),
    title: l.title,
    // The provider first (the share image takes its logo from it); a value the listing doesn't state is left out, not shown as "not stated".
    facts: [l.company || null, (t.kind === "project" ? t.stipend !== undefined : !!t.awardAmount) ? valueLabel(t) : null, t.deadline ? deadlineLabel(t) : null],
    lines: [
      t.levels?.length && `For: ${levelsLabel(t)}`,
      t.deadline && `Apply by: ${shortDate(t.deadline)}`,
      t.region && `Region: ${t.region}`,
      t.kind === "project" && t.durationWeeks && `Duration: ${durationLabel(t)}`,
      t.kind === "project" && l.workMode && `Where: ${l.workMode === "remote" ? WORK_MODE_LABEL.remote : [l.location, WORK_MODE_LABEL[l.workMode]].filter(Boolean).join(" · ")}`,
      t.documents?.length && `Documents: ${t.documents.join(", ")}`,
      t.officialUrl && `Official page: ${t.officialUrl}`,
      l.sourceName && `From: ${l.sourceName}${l.origin === "wonderstar" && !l.companyVerified ? " (organisation not verified yet)" : ""}`,
      "Applying is always free. Never pay to apply.",
    ],
    details: l.description,
    url: publicPath("scholarships", l.id),
    source: l.sourceName,
    originalUrl: l.origin === "outside" ? l.applyUrl : undefined,
  };
};

/** The listing behind one of the student's own WonderWorks applications, so its page can share it (`/s/scholarships/ws_<id>`). */
export const listingOfApplication = (a: MyScholarshipApplicationDetail): ScholarshipListing => ({
  id: `ws_${a.postingId}`,
  origin: "wonderstar",
  postingId: a.postingId,
  title: a.title,
  company: a.company,
  location: a.location,
  workMode: a.workMode,
  terms: a.terms,
  termsFrom: "company",
  skills: [],
  description: a.description,
  ...(a.terms.officialUrl ? { applyUrl: a.terms.officialUrl } : {}),
  sourceId: "schol_wonderstar",
  sourceName: "WonderWorks organisations",
});
