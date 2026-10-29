"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "../api";
import { applyFacets, type InternshipListing } from "../domain";
import { selectProfile, useInternshipsStore } from "../store";
import { InternshipCard, InternshipSheet } from "./Listing";

const STIPENDS = [5_000, 10_000, 20_000, 50_000];
const MONTHS = [1, 2, 3, 6, 12];
const k = (n: number) => `${n / 1000}k+`;
const SORTS = { relevance: "Relevance", date: "Newest", stipend: "Stipend" };

/** The next twelve months, for "Starts in". */
function nextMonths(now = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) };
  });
}

/** Refine's values as the Internships facets (domain.ts::applyFacets), then the order picked. */
export function refineInternships(list: InternshipListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, { minStipend: Number(v.stipend) || undefined, maxMonths: Number(v.months) || undefined, startMonth: v.start || undefined, remoteOnly: v.remote === "1" || undefined });
  const pay = (l: InternshipListing) => l.terms.stipendMax ?? l.terms.stipendMin ?? -1;
  const sorted = sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "stipend" ? [...kept].sort((a, b) => pay(b) - pay(a)) : kept;
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<InternshipListing>>("/api/m/internships/search", { body: { query, places } });

/**
 * Internships Find (WJ-418, WJ-421): Jobs' Find with Internships' own fields. The student's words and places, searched
 * across the Internships dataset's own sources (WonderWorks companies, Adzuna, company career sites, Remotive, Remote OK).
 * Opening the page searches nothing; the box starts from their last search or their course, and asks when there's
 * neither. Refine: stipend a month, duration, start month, remote.
 */
export function InternshipsFind() {
  const course = useInternshipsStore((s) => selectProfile(s)?.course);
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "remote", label: "Remote only", kind: "check", corner: true, title: "Only internships you can do remotely" },
      { key: "stipend", label: "Stipend a month", kind: "chips", any: "Any", options: STIPENDS.map((n) => ({ value: String(n), label: k(n) })), pill: (v) => (v ? `${k(Number(v))} stipend` : "Any stipend") },
      { key: "months", label: "Duration, at most", kind: "chips", any: "Any", options: MONTHS.map((n) => ({ value: String(n), label: `${n} mo` })), pill: (v) => (v ? `Up to ${v} mo` : "Any duration") },
      { key: "start", label: "Starts in", kind: "select", any: "Any month", options: nextMonths() },
    ],
    [],
  );
  return (
    <ModuleFind
      module="internships"
      noun={{ one: "internship", many: "internships" }}
      placeholder="Search internships by field or role"
      startWords={course}
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineInternships}
      Card={InternshipCard}
      Sheet={InternshipSheet}
      idle={{ title: "Search for an internship", body: "Type the field you want to intern in — for example what you study — and press Search." }}
      needWords="Type the field you want to intern in — for example what you study."
      dictateHint="Listening — say the field and where, e.g. “marketing internship in Pune”."
    />
  );
}
