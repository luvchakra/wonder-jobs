"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, CATEGORIES, LANE_LABEL, type Category, type Lane, type ServiceListing } from "../domain";
import { ServiceCard } from "./Listing";

const SORTS = { relevance: "Relevance", date: "Newest", rating: "Rating" };
const LANES = Object.keys(LANE_LABEL) as Lane[];

/** Refine's values as the Talent & Services facets (domain.ts::applyFacets), then the order picked. */
export function refineServices(list: ServiceListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, { lane: (v.lane as Lane) || undefined, category: (v.category as Category) || undefined, warranty: v.warranty === "1" || undefined, rated: v.rated === "1" || undefined });
  const rating = (l: ServiceListing) => l.terms.rating ?? -1;
  const sorted = sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "rating" ? [...kept].sort((a, b) => rating(b) - rating(a)) : kept;
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<ServiceListing>>("/api/m/services/search", { body: { query, places } });

/**
 * Talent & Services Find: Jobs' Find with this module's own fields. The client's words (a service) and place, searched
 * across the module's own sources (WonderWorks pros, Freelancer.com experts). Opening the page searches nothing; the
 * box starts from their last search and asks when there's none. Refine: at
 * your place or remote, the service, has a warranty, rated 4 or more.
 */
export function ServicesFind() {
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "lane", label: "Where the work happens", kind: "chips", any: "Any", options: LANES.map((l) => ({ value: l, label: LANE_LABEL[l] })), pill: (v) => (v ? LANE_LABEL[v as Lane] : "Anywhere") },
      { key: "category", label: "Service", kind: "select", any: "Any", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
      { key: "warranty", label: "Has a warranty", kind: "check", title: "Only pros who state a warranty" },
      { key: "rated", label: "Rated 4 or more", kind: "check", title: "Only pros whose source reports a rating of 4 or more" },
    ],
    [],
  );
  return (
    <ModuleFind
      module="services"
      noun={{ one: "pro", many: "pros" }}
      placeholder="Search a service — AC repair, plumber, logo design"
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineServices}
      Card={ServiceCard}
      idle={{ title: "Find a pro", body: "Type what you need — for example AC repair, plumber or logo design — add a place under Refine for work at your door, and press Search." }}
      needWords="Type what you need — for example AC repair or logo design."
      dictateHint="Listening — say the service and where, e.g. “AC repair in Pune”."
    />
  );
}
