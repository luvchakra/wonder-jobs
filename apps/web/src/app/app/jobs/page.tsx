"use client";
import { JOB_TYPE_LABEL } from "@/domain/jobs/jobType";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useHydration } from "@/store/hydration";
import { placesOnly } from "@/domain/jobs/searchScope";
import type { JobFilters } from "@/domain/jobs/types";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { describeWords, foundNothing, useJobSearch } from "@/lib/useJobSearch";
import { PageLoading } from "@/components/common/States";
import { JobsBoard } from "@/modules/jobs/components/JobsBoard";
import { findModeOf, type FindMode } from "@/domain/jobs/findMode";
import { fullTimeSearchAs, roleArrival } from "@/modules/jobs/searchAs";
import { switchFindMode } from "@/lib/switchFindMode";
import { JobsEmpty, ReadinessBlockerCard, RelevanceNoteBar, RoleChips, SearchingPanel, SearchStatusLine, WantedRole } from "@/modules/jobs/components/JobsReadiness";

/**
 * Signed in = looking at relevant jobs. This screen is the job list, searched on open when it's
 * missing, stale or for a different search. When jobs can't be shown, the one step that unblocks
 * them is the whole screen, done in place; what only weakens relevance is a single note with one fix.
 */
function JobsHome() {
  const dna = useCareerStore((s) => s.dna);
  const roles = useCareerStore((s) => s.roles ?? []);
  const params = useSearchParams();
  const router = useRouter();
  const explicit = params.has("search") || params.has("role") || params.has("refresh");
  const search = useJobSearch({ auto: !explicit });
  const attention = useHomeAttention();

  const mode = useJobsStore((s) => findModeOf(s.filters));
  // Opened from a role's Search (?role=): that role, picked in Full Time (where the search below runs it).
  const [picked, setPicked] = useState<{ mode: FindMode; role: string | null | false } | undefined>(() => (params.get("role") ? { mode: "full_time", role: params.get("role")! } : undefined));
  // The words in the box as last seen (below: clearing them brings the profile's list back).
  const query = useJobsStore((s) => s.filters.query);
  const typedBefore = useRef(query.trim());
  const leftForRole = useRef(false);
  // Arriving with something to search (Ask Wonder's "Find …", a role's "Search", an old Find link):
  // search it once, then drop it from the address so a reload doesn't search again.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    const words = params.get("search");
    const roleId = params.get("role");
    const refresh = params.get("refresh");
    if (!words && !roleId && !refresh) return;
    asked.current = true;
    // A role's Search: Full Time, with the role picked under "Search as" (and on Looking for) for what follows.
    const arrival = roleArrival(roleId, findModeOf(useJobsStore.getState().filters), roles);
    if (arrival) {
      if (arrival.leavePartTime) {
        // Leaving Part Time empties its box: that isn't "the words were cleared", so the profile's list and search don't replace the role's.
        leftForRole.current = true;
        switchFindMode("full_time");
      }
      void search.searchAsRole(arrival.roleId);
    } else if (roleId) void search.searchAsRole(roleId);
    else if (words) void search.searchWords(words);
    else {
      // Back from Career Profile after a change: search again as the profile the last search ran as.
      const lastRole = fullTimeSearchAs(undefined, search.last?.config.role?.id, roles);
      void (lastRole && findModeOf(useJobsStore.getState().filters) === "full_time" ? search.searchAsRole(lastRole) : search.searchNow());
    }
    router.replace("/app/jobs");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, from the address the page was opened with
  }, [params, search, router]);
  // "Search as" picks a role without searching; Refine's Search runs it. undefined = nothing picked yet,
  // null = My profile, false = none (Part Time only, and its start: only the words typed).
  // The role picked under "Search as", for the mode it was picked in (switching Full Time / Part Time in the top bar forgets it).
  // A role since deleted counts as nothing picked.
  const pickedRole = picked && picked.mode === mode && (typeof picked.role !== "string" || roles.some((r) => r.id === picked.role)) ? picked.role : undefined;
  const setPickedRole = (role: string | null | false | undefined) => setPicked(role === undefined ? undefined : { mode, role });

  // Clearing the typed words brings back the profile's results and view as they were before the words
  // were searched — not what's left of the words' results. (After a reload nothing is kept: search again.)
  const fitBeforeWords = useRef<JobFilters["minFit"] | undefined>(undefined);
  useEffect(() => {
    const was = typedBefore.current;
    typedBefore.current = query.trim();
    if (typedBefore.current || !was) return;
    if (leftForRole.current) {
      leftForRole.current = false;
      return;
    }
    const t = setTimeout(() => {
      const s = useJobsStore.getState();
      // Part Time never falls back to the profile's results.
      if (s.filters.query.trim() || !s.searchedFor || s.filters.skipProfile) return;
      const restored = s.restoreProfileCatalog();
      if (fitBeforeWords.current !== undefined) s.setFilters({ minFit: fitBeforeWords.current });
      if (!restored) void search.searchNow({ locations: s.filters.locations ?? search.readiness.locations });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the words change
  }, [query]);
  const firstName = dna.name.split(" ")[0];
  const typed = useJobsStore((s) => s.filters.query.trim().toLowerCase());
  // Part Time searches only words, so its "Search as" starts with none picked; picking one puts that role's
  // words in the box (to search with Search), and it stays picked only while the box holds them.
  const roleWords = (id: string | null) => (id === null ? search.readiness.query : (roles.find((r) => r.id === id)?.title ?? ""));
  const searchAs: string | null | false =
    mode === "part_time"
      ? typeof pickedRole === "string" || pickedRole === null
        ? roleWords(pickedRole).trim().toLowerCase() === typed && !!typed
          ? pickedRole
          : false
        : false
      : fullTimeSearchAs(pickedRole, search.active?.config.role?.id ?? search.last?.config.role?.id, roles);
  const pickSearchAs = (id: string | null | false) => {
    setPickedRole(id);
    if (mode === "part_time") useJobsStore.getState().setFilters({ query: id === false ? "" : roleWords(id) });
  };
  // Opening Find in Part Time shows Part Time's last results (kept, even after the app was closed), never a
  // new search: with the profile's list on screen, the words' list set aside comes back.
  const hydrated = useHydration((h) => h.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const s = useJobsStore.getState();
    if (findModeOf(s.filters) === "part_time" && !s.searchedFor) s.restoreWordsCatalog();
  }, [hydrated]);
  if (search.readiness.blocker) {
    return (
      <div className="mx-auto max-w-xl pt-2 md:pt-6">
        <p className="mb-3 text-[15px] font-medium text-ink-2">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <ReadinessBlockerCard blocker={search.readiness.blocker} />
      </div>
    );
  }

  return (
    <>
      {/* Full Time or Part Time is chosen from the menu in the top bar, beside the avatar. */}
      <JobsBoard
        header={search.active ? <SearchStatusLine search={search} monitoring={attention.isMonitoring} /> : null}
        // Full Time: what Wonder searches for, with one tap to change it, in the search box's place at the start of the
        // filter bar, so from 1024px it shares the row with Refine, Location, Salary and Search (owner, 2026-11-06).
        lead={mode === "full_time" ? <WantedRole className="mb-0" as={typeof searchAs === "string" ? roles.find((r) => r.id === searchAs) : undefined} /> : undefined}
        // "Search as" is the first thing in Refine; Looking for is on the page, how many and from where above the jobs.
        refineTop={roles.length > 0 ? <RoleChips roles={roles} current={searchAs} onPick={pickSearchAs} busy={false} allowNone={mode === "part_time"} /> : undefined}
        // A role picked under "Search as" counts as one Refine setting; Clear goes back to My profile (Part Time: none).
        searchAs={{ set: typeof searchAs === "string", clear: () => pickSearchAs(mode === "part_time" ? false : null) }}
        footer={
          <div className="mt-6">
            <h1 className="wj-sr-only">Find jobs</h1>
            {/* What the list is from — every source's count a tap away — under the jobs, out of the way. */}
            {!search.active && <SearchStatusLine search={search} monitoring={attention.isMonitoring} />}
            <RelevanceNoteBar notes={search.readiness.notes} />
          </div>
        }
        empty={<JobsEmpty search={search} />}
        searching={search.active ? <SearchingPanel search={search} /> : null}
        // Part Time's own words found nothing: say so, rather than asking for words again.
        partTimeMiss={search.last && search.last.config.origin === "words" && !search.last.config.role && foundNothing(search.last) ? search.last.config.searchCriteria.query : null}
        searched={search.last ? { query: search.last.config.searchCriteria.query, locations: search.last.config.searchCriteria.locations } : null}
        sourceSearch={{
          run: (text, places) => {
            // The candidate's own search shows everything it finds, best answer first — not only profile fits.
            const s = useJobsStore.getState();
            if (!s.searchedFor) fitBeforeWords.current = s.filters.minFit;
            s.setFilters({ minFit: null });
            setPickedRole(undefined);
            void search.searchWords(text, places).then((run) => {
              if (run) window.scrollTo({ top: 0, behavior: "smooth" });
            });
          },
          describe: (text, places) => {
            const skip = !!useJobsStore.getState().filters.skipProfile;
            const d = describeWords(text, skip ? [] : search.readiness.locations, skip ? undefined : places);
            // Only places or pay typed: the profile's own roles, there — unless Skip Career Profile is on.
            const what = d.query || (!skip && (d.fromWords || d.highPay || d.jobTypes.length) ? search.readiness.query : "");
            const kinds = d.jobTypes.length ? `, ${d.jobTypes.map((t) => JOB_TYPE_LABEL[t].toLowerCase()).join(" or ")} only` : "";
            return what ? `“${what}”${d.locations.length ? ` in ${d.locations.join(", ")}` : " anywhere"}${kinds}${d.highPay ? ", highest pay first" : ""}` : null;
          },
          // The profile's places, not "Remote" (a work mode — Refine's Work mode).
          places: placesOnly(search.readiness.locations) ?? [],
          runPlaces: (places) => {
            // Search runs as the profile the Looking for pill shows: one picked under "Search as", else the one the last
            // search ran as (kept after a reload), so the two never disagree.
            const searched = typeof searchAs === "string" ? search.searchAsRole(searchAs, places) : search.searchNow({ locations: places });
            setPickedRole(undefined);
            void searched.then((run) => {
              if (run) window.scrollTo({ top: 0, behavior: "smooth" });
            });
          },
        }}
      />
    </>
  );
}

export default function JobsHomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <JobsHome />
    </Suspense>
  );
}
