"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, COMMITMENTS, ROLES, type CofounderListing, type Commitment, type ListingKind, type Role } from "../domain";
import { CofounderCard } from "./Listing";

const SORTS = { relevance: "Relevance", date: "Newest" };
const KIND_LABEL: Record<ListingKind, string> = { person: "People", team: "Teams" };

/** Refine's values as the Co-founders facets (domain.ts::applyFacets), then the order picked. */
export function refineCofounders(list: CofounderListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, { kind: (v.kind as ListingKind) || undefined, role: (v.role as Role) || undefined, commitment: (v.commitment as Commitment) || undefined, hasIdea: v.idea === "1" || undefined });
  return { kept: sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : kept, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<CofounderListing>>("/api/m/cofounders/search", { body: { query, places } });

/**
 * Co-founders Find: Jobs' Find with this module's own fields. The searcher's words (a skill, an idea) and place, searched
 * across the module's own source (people and teams on WonderWorks who chose to be found). Opening the page searches
 * nothing. Refine: a person or a team, role, commitment, has an idea.
 */
export function CofoundersFind() {
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "kind", label: "People or teams", kind: "chips", any: "Any", options: (Object.keys(KIND_LABEL) as ListingKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })), pill: (v) => (v ? KIND_LABEL[v as ListingKind] : "People and teams") },
      { key: "role", label: "Role", kind: "chips", any: "Any", options: ROLES.map((r) => ({ value: r, label: r })), pill: (v) => v || "Tech or Business" },
      { key: "commitment", label: "Commitment", kind: "select", any: "Any", options: COMMITMENTS.map((c) => ({ value: c, label: c })) },
      { key: "idea", label: "Has an idea", kind: "check", title: "Only people and teams who say what they're building" },
    ],
    [],
  );
  return (
    <ModuleFind
      module="cofounders"
      noun={{ one: "match", many: "matches" }}
      placeholder="Search a skill, an idea or a place — fintech, sales, Pune"
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineCofounders}
      Card={CofounderCard}
      idle={{ title: "Find someone to build with", body: "Type a skill, an idea or an industry, add a city under Refine, and press Search. People and teams show only what they chose to show everyone." }}
      needWords="Type a skill, an idea or an industry — for example fintech or sales."
      dictateHint="Listening — say a skill or an idea, e.g. “fintech sales”."
    />
  );
}
