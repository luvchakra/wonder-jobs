"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, CATEGORIES, CONDITIONS, priceLabel, type Condition, type Facets, type MarketListing } from "../domain";
import { MarketCard } from "./Listing";

const SORTS = { relevance: "Newest", low: "Price: low to high", high: "Price: high to low" };
const CAPS = [1000, 5000, 10000, 50000];

/** Refine's values as the Marketplace facets (domain.ts::applyFacets), then the order picked (newest first is the default). */
export function refineListings(list: MarketListing[], v: FacetValues, sort: string) {
  const cap = Number(v.maxPrice);
  const f: Facets = { category: (CATEGORIES as readonly string[]).includes(v.category ?? "") ? (v.category as Facets["category"]) : "", condition: (CONDITIONS as readonly string[]).includes(v.condition ?? "") ? (v.condition as Condition) : "", maxPrice: CAPS.includes(cap) ? cap : undefined };
  const { kept, hidden } = applyFacets(list, f);
  const sorted = sort === "low" ? [...kept].sort((a, b) => a.terms.price - b.terms.price) : sort === "high" ? [...kept].sort((a, b) => b.terms.price - a.terms.price) : [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<MarketListing>>("/api/m/marketplace/search", { body: { query, places } });

/**
 * Buy, Sell & Rent Find: Jobs' Find with this module's own fields. The person's words (what they're looking for) and area,
 * searched across the module's own sources (WonderWorks listings). Opening the page searches nothing. Refine: category,
 * condition and a price ceiling.
 */
export function MarketplaceFind() {
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "condition", label: "Condition", kind: "chips", any: "Any", options: CONDITIONS.map((c) => ({ value: c, label: c })), pill: (v) => v || "Any condition" },
      { key: "maxPrice", label: "Price up to", kind: "chips", any: "Any", options: CAPS.map((c) => ({ value: String(c), label: priceLabel(c) })), pill: (v) => (v ? `Up to ${priceLabel(Number(v))}` : "Any price") },
      { key: "category", label: "Category", kind: "select", any: "Any", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
    ],
    [],
  );
  return (
    <ModuleFind
      module="marketplace"
      noun={{ one: "listing", many: "listings" }}
      placeholder="Search what you want — study table, bicycle, guitar"
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineListings}
      Card={MarketCard}
      idle={{ title: "Find something pre-used", body: "Type what you're looking for, add your area under Refine, and press Search." }}
      needWords="Type what you're looking for — for example study table, bicycle or guitar."
      dictateHint="Listening — say what you want, e.g. “study table”."
    />
  );
}
