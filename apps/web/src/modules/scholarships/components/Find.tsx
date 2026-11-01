"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, LEVEL_LABEL, LEVELS, type DeadlineWindow, type Kind, type Level, type ScholarshipListing } from "../domain";
import { selectProfile, useScholarshipsStore } from "../store";
import { ScholarshipCard } from "./Listing";

const AWARDS = [10_000, 25_000, 50_000, 100_000];
const k = (n: number) => (n >= 100_000 ? `${n / 100_000}L+` : `${n / 1000}k+`);
const SORTS = { relevance: "Relevance", deadline: "Closing soon", date: "Newest", award: "Award" };
const WINDOWS: { value: DeadlineWindow; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** Refine's values as this module's facets (domain.ts::applyFacets), then the order picked. */
export function refineScholarships(list: ScholarshipListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, {
    kind: (v.kind || undefined) as Kind | undefined,
    level: (v.level || undefined) as Level | undefined,
    field: v.field || undefined,
    closesWithin: (v.closes || undefined) as DeadlineWindow | undefined,
    minAward: Number(v.award) || undefined,
    region: v.region || undefined,
    remoteOnly: v.remote === "1" || undefined,
    paidOnly: v.paid === "1" || undefined,
  });
  const value = (l: ScholarshipListing) => (l.terms.kind === "project" ? (l.terms.stipend ?? -1) : (l.terms.awardAmount ?? -1));
  const sorted =
    sort === "deadline" ? [...kept].sort((a, b) => (a.terms.deadline ?? "9999").localeCompare(b.terms.deadline ?? "9999")) : sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "award" ? [...kept].sort((a, b) => value(b) - value(a)) : kept;
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<ScholarshipListing>>("/api/m/scholarships/search", { body: { query, places } });

/**
 * Scholarships & Projects Find: Jobs' Find with this module's own fields. The student's words and places, searched
 * across this module's own sources (WonderWorks organisations, Grants.gov, partner uploads); an empty search shows the
 * latest. Opening the page searches nothing. Refine: kind, deadline window, level, award, remote and paid; the field is
 * the search's words and the region is Refine's Location.
 */
export function ScholarshipsFind() {
  const field = useScholarshipsStore((s) => selectProfile(s)?.field);
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "remote", label: "Remote only", kind: "check", corner: true, title: "Only projects you can do remotely" },
      { key: "kind", label: "Scholarship or project", kind: "chips", any: "Both", options: [{ value: "scholarship", label: "Scholarships" }, { value: "project", label: "Projects" }], pill: (v) => (v === "scholarship" ? "Scholarships" : v === "project" ? "Projects" : "Both kinds") },
      { key: "closes", label: "Closes within", kind: "chips", any: "Any", options: WINDOWS, pill: (v) => (v ? `Closes in ${v} days` : "Any deadline") },
      { key: "level", label: "Level", kind: "select", any: "Any level", options: LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
      { key: "award", label: "Award, at least", kind: "chips", any: "Any", options: AWARDS.map((n) => ({ value: String(n), label: k(n) })) },
      { key: "paid", label: "Paid projects only", kind: "check", title: "Only projects with a stipend" },
    ],
    [],
  );
  return (
    <ModuleFind
      module="scholarships"
      noun={{ one: "listing", many: "scholarships and projects" }}
      placeholder="Search scholarships and projects"
      startWords={field}
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineScholarships}
      Card={ScholarshipCard}
      idle={{ title: "Search scholarships and projects", body: "Type your field or what you're looking for, or press Search to see the latest." }}
      dictateHint="Listening — say what you want, e.g. “engineering scholarship in Karnataka”."
    />
  );
}
