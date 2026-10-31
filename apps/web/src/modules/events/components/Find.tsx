"use client";
import { useMemo } from "react";
import { ModuleFind, type FacetSpec, type FacetValues, type FindRun } from "@/wonderworks/find/ModuleFind";
import { call } from "@/wonderworks/api";
import { applyFacets, CATEGORIES, WHEN_OPTIONS, type EventListing, type Facets } from "../domain";
import { EventCard } from "./Listing";

const SORTS = { relevance: "Soonest", date: "Newest posted", seats: "Most seats left" };

/** Refine's values as the Events facets (domain.ts::applyFacets), then the order picked (soonest first is the default). */
export function refineEvents(list: EventListing[], v: FacetValues, sort: string) {
  const f: Facets = { when: (WHEN_OPTIONS as readonly string[]).includes(v.when ?? "") ? (v.when as Facets["when"]) : "Any time", where: v.where === "online" || v.where === "in_person" ? v.where : "", openOnly: v.openOnly === "1", tag: v.tag ?? "" };
  const { kept, hidden } = applyFacets(list, f);
  const left = (l: EventListing) => (l.terms.capacity === undefined ? Infinity : l.seatsLeft ?? 0);
  const sorted = sort === "date" ? [...kept].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")) : sort === "seats" ? [...kept].sort((a, b) => left(b) - left(a)) : [...kept].sort((a, b) => a.terms.startsAt.localeCompare(b.terms.startsAt));
  return { kept: sorted, hidden };
}

const search = (query: string, places: string[]) => call<FindRun<EventListing>>("/api/m/events/search", { body: { query, places } });

/**
 * Events Find: Jobs' Find with this module's own fields. The person's words (what they're into) and city, searched across
 * the module's own sources (WonderWorks events). Opening the page searches nothing. Refine: when, online or in person,
 * kind, and only events with seats left.
 */
export function EventsFind() {
  const facets = useMemo<FacetSpec[]>(
    () => [
      { key: "when", label: "When", kind: "chips", any: "Any time", options: WHEN_OPTIONS.filter((w) => w !== "Any time").map((w) => ({ value: w, label: w })), pill: (v) => v || "Any time" },
      { key: "where", label: "Where", kind: "chips", any: "Any", options: [{ value: "in_person", label: "In person" }, { value: "online", label: "Online" }], pill: (v) => (v === "online" ? "Online" : v === "in_person" ? "In person" : "Online or in person") },
      { key: "tag", label: "Kind", kind: "select", any: "Any", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
      { key: "openOnly", label: "Only events with seats left", kind: "check", corner: true },
    ],
    [],
  );
  return (
    <ModuleFind
      module="events"
      noun={{ one: "event", many: "events" }}
      placeholder="Search what you're into — board games, running, pottery"
      facets={facets}
      sorts={SORTS}
      search={search}
      refine={refineEvents}
      Card={EventCard}
      idle={{ title: "Find something to do", body: "Type what you're into, add your city under Refine, and press Search." }}
      needWords="Type what you're into — for example board games, running or pottery."
      dictateHint="Listening — say what you're into, e.g. “board games”."
    />
  );
}
