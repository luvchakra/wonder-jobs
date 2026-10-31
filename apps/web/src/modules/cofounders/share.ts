import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import type { CofounderListing } from "./domain";

/**
 * What Share sends about a founder or team, everything the listing shows to other people as it reads now: their headline,
 * role, commitment, place, skills, idea, equity, stage and open roles, and the description. A person's listing is what
 * they chose to show other WonderWorks users, not the open web, so it has no public page: the link opens the module, and
 * whoever opens it signs in. Contact details are never part of a listing and never shared.
 */
export const shareOf = (l: CofounderListing): ListingShareProps => {
  const t = l.terms;
  const team = l.kind === "team";
  return {
    module: "cofounders",
    noun: team ? "team" : "co-founder profile",
    title: l.title,
    facts: [team ? `Team${t.stage ? ` · ${t.stage}` : ""}` : t.role ? `${t.role} founder` : "Founder", t.commitment, l.location],
    lines: [
      team && t.founders && `Founders: ${t.founders}`,
      !team && t.skills?.length && `Skills: ${t.skills.join(", ")}`,
      team && l.company && `Building: ${l.company}`,
      !team && t.idea && `Idea: ${t.idea}`,
      t.equity && `Equity: ${t.equity}`,
      team && t.openRoles?.length && `Looking for: ${t.openRoles.map((o) => (o.skills.length ? `${o.role} (${o.skills.join(", ")})` : o.role)).join("; ")}`,
    ],
    details: l.description,
    url: "/app/m/cofounders",
    source: l.sourceName,
  };
};
