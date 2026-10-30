"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, BOARDS, GRADE_LABEL, GRADES, HOURS_LABEL, type Board, type Grade, type Hours, type TeachingListing } from "../domain";
import { selectProfile, useTeachingStore } from "../store";
import { TeachingCard } from "./Listing";

const SORTS = { relevance: "Relevance", date: "Newest", pay: "Pay" };
const HOURS = Object.keys(HOURS_LABEL) as Hours[];
const short = (g: Grade) => GRADE_LABEL[g].replace(/ \(.*\)$/, "");

/** Refine's values as the Teaching facets (domain.ts::applyFacets), then the order picked. */
export function refineTeaching(list: TeachingListing[], v: FacetValues, sort: string) {
  const { kept, hidden } = applyFacets(list, { grade: (v.grade as Grade) || undefined, board: (v.board as Board) || undefined, hours: (v.hours as Hours) || undefined, remoteOnly: v.remote === "1" || undefined });
  const pay = (l: TeachingListing) => l.terms.payMax ?? l.terms.payMin ?? -1;
  const sorted = sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "pay" ? [...kept].sort((a, b) => pay(b) - pay(a)) : kept;
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<TeachingListing>>("/api/m/teaching/search", { body: { query, places } });

/**
 * Teaching Find: Jobs' Find with Teaching's own fields. The teacher's words and places, searched across the Teaching
 * dataset's own sources (WonderWorks schools, Adzuna India, Jooble, Himalayas). Opening the page searches nothing; the
 * box starts from their last search or the first subject they teach, and asks when there's neither. Refine: grade
 * level, board, full time / part time / tuition, online.
 */
export function TeachingFind() {
  const subject = useTeachingStore((s) => selectProfile(s)?.subjects[0]);
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "remote", label: "Online only", kind: "check", corner: true, title: "Only openings you can teach online" },
      { key: "grade", label: "Grade level", kind: "chips", any: "Any", options: GRADES.map((g) => ({ value: g, label: short(g) })), pill: (v) => (v ? short(v as Grade) : "Any grade") },
      { key: "board", label: "Board", kind: "chips", any: "Any", options: BOARDS.map((b) => ({ value: b, label: b })), pill: (v) => v || "Any board" },
      { key: "hours", label: "Hours", kind: "select", any: "Any", options: HOURS.map((h) => ({ value: h, label: HOURS_LABEL[h] })) },
    ],
    [],
  );
  return (
    <ModuleFind
      module="teaching"
      noun={{ one: "opening", many: "openings" }}
      placeholder="Search teaching jobs by subject"
      startWords={subject}
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineTeaching}
      Card={TeachingCard}
      idle={{ title: "Search for a teaching job", body: "Type the subject you teach — for example Physics or English — and press Search." }}
      needWords="Type the subject you teach — for example Physics or English."
      dictateHint="Listening — say the subject and where, e.g. “maths teacher in Pune”."
    />
  );
}
