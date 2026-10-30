"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, FEE_BANDS, FOCUS, LANGUAGES, MODE_LABEL, MODES, type Mode, type TherapistListing } from "../domain";
import { TherapistCard } from "./Listing";

const SORTS = { relevance: "Relevance", date: "Newest", fee: "Lowest fee" };

/** Refine's values as the Therapists facets (domain.ts::applyFacets), then the order picked. */
export function refineTherapists(list: TherapistListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, { mode: (v.mode as Mode) || undefined, language: v.language || undefined, focus: v.focus || undefined, maxFee: v.maxFee ? Number(v.maxFee) : undefined });
  const fee = (l: TherapistListing) => l.terms.feeMin ?? l.terms.feeMax ?? Infinity;
  const sorted = sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "fee" ? [...kept].sort((a, b) => fee(a) - fee(b)) : kept;
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<TherapistListing>>("/api/m/therapists/search", { body: { query, places } });

/**
 * Therapists Find: Jobs' Find with this module's own fields. The client's words (a name, language or way of working)
 * and place, searched across the module's own sources (WonderWorks practitioners). Opening the page searches nothing.
 * Searches are never stored (wonderworks/store.ts::PRIVATE_SEARCH_MODULES). Refine: online or in person, language,
 * focus and a fee ceiling.
 */
export function TherapistsFind() {
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "mode", label: "How you'd meet", kind: "chips", any: "Any", options: MODES.map((m) => ({ value: m, label: MODE_LABEL[m] })), pill: (v) => (v ? MODE_LABEL[v as Mode] : "Online or in person") },
      { key: "language", label: "Language", kind: "select", any: "Any", options: LANGUAGES.map((l) => ({ value: l, label: l })) },
      { key: "focus", label: "Focus area", kind: "select", any: "Any", options: FOCUS.map((f) => ({ value: f, label: f })) },
      { key: "maxFee", label: "Fee up to", kind: "select", any: "Any", options: FEE_BANDS.map((b) => ({ value: String(b), label: `₹${b.toLocaleString("en-IN")}` })) },
    ],
    [],
  );
  return (
    <ModuleFind
      module="therapists"
      noun={{ one: "practitioner", many: "practitioners" }}
      placeholder="Search a language, approach or name — Hindi, CBT"
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineTherapists}
      Card={TherapistCard}
      idle={{ title: "Find a practitioner", body: "Type a language, a way of working or a name, add a city under Refine for in-person sessions, and press Search. WonderWorks doesn't keep your searches." }}
      needWords="Type a language, a way of working or a name."
      dictateHint="Listening — say a language or approach, e.g. “Hindi, CBT”."
    />
  );
}
