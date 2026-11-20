import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { isOutside, type CofounderListing } from "./domain";

/**
 * What Share sends about a founder or team (owner, 2026-11-03: "go with b"). A profile's fields are shown to everyone on
 * WonderWorks, not to the open web, so sharing one off WonderWorks is the owner's own choice, "Let others share my
 * profile", off by default. Off (or an older saved copy that doesn't say): Share sends only a generic Co-founders on
 * WonderWorks message and the module's link, with no headline, role, skills or place. On: the crisp message, built from the
 * fields the owner shows everyone. Another person's Share reads the choice and never overrides it. A person's listing has
 * no public page, so the link opens the module and whoever opens it signs in. Contact details are never part of a listing.
 */
export const shareOf = (l: CofounderListing): ListingShareProps => {
  // A post or startup from a public source shares what its source made public, and links back to where it was published.
  if (isOutside(l)) {
    const t = l.terms;
    return { module: "cofounders", noun: l.kind === "post" ? "co-founder post" : "startup", title: l.title, facts: [l.kind === "post" ? `Post on ${l.sourceName}` : "New startup", t.batch, l.location], lines: [], details: l.description, url: l.url ?? "/app/m/cofounders", source: l.sourceName };
  }
  if (l.shareable !== true) return { module: "cofounders", noun: "place to find a co-founder", title: "Co-founders on WonderWorks", facts: ["Find someone to build with"], lines: [], url: "/app/m/cofounders" };
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
