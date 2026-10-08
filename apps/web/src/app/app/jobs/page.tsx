"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import type { JobFilters } from "@/domain/jobs/types";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { describeWords, useJobSearch } from "@/lib/useJobSearch";
import { PageLoading } from "@/components/common/States";
import { JobsBoard } from "@/components/jobs/JobsBoard";
import { JobsEmpty, ReadinessBlockerCard, RelevanceNoteBar, RoleChips, SearchStatusLine, WantedRole } from "@/components/jobs/JobsReadiness";

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
    if (roleId) void search.searchAsRole(roleId);
    else if (words) void search.searchWords(words);
    else void search.searchNow();
    router.replace("/app/jobs");
  }, [params, search, router]);
  // "Search as" picks a role without searching; Refine's Search runs it. undefined = nothing picked yet.
  const [pickedRole, setPickedRole] = useState<string | null | undefined>(undefined);

  // Clearing the typed words brings back the profile's results and view as they were before the words
  // were searched — not what's left of the words' results. (After a reload nothing is kept: search again.)
  const query = useJobsStore((s) => s.filters.query);
  const fitBeforeWords = useRef<JobFilters["minFit"] | undefined>(undefined);
  const typedBefore = useRef(query.trim());
  useEffect(() => {
    const was = typedBefore.current;
    typedBefore.current = query.trim();
    if (typedBefore.current || !was) return;
    const t = setTimeout(() => {
      const s = useJobsStore.getState();
      if (s.filters.query.trim() || !s.searchedFor) return;
      const restored = s.restoreProfileCatalog();
      if (fitBeforeWords.current !== undefined) s.setFilters({ minFit: fitBeforeWords.current });
      if (!restored) void search.searchNow({ locations: s.filters.locations ?? search.readiness.locations });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the words change
  }, [query]);
  const firstName = dna.name.split(" ")[0];

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
      {/* What Wonder searches for, first thing on the page, with one tap to change it. */}
      <WantedRole search={search} />
      <JobsBoard
        header={search.active ? <SearchStatusLine search={search} monitoring={attention.isMonitoring} /> : null}
        // What was searched and "Search as" live in Refine — the list stays the page.
        refineTop={
          <>
            <WantedRole search={search} />
            {!search.active && <SearchStatusLine search={search} monitoring={attention.isMonitoring} />}
            {roles.length > 0 && <RoleChips roles={roles} current={pickedRole !== undefined ? pickedRole : (search.active?.config.role?.id ?? search.last?.config.role?.id ?? null)} onPick={setPickedRole} busy={false} />}
          </>
        }
        footer={
          <div className="mt-6">
            <h1 className="wj-sr-only">Find jobs</h1>
            <RelevanceNoteBar notes={search.readiness.notes} />
          </div>
        }
        empty={<JobsEmpty search={search} />}
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
            const d = describeWords(text, search.readiness.locations, places);
            // Only places typed: the profile's own roles, there.
            const what = d.query || (d.fromWords ? search.readiness.query : "");
            return what ? `“${what}”${d.locations.length ? ` in ${d.locations.join(", ")}` : " anywhere"}` : null;
          },
          places: search.readiness.locations,
          runPlaces: (places) => {
            // A picked "Search as" role only searches here, when the candidate taps Search.
            const searched = typeof pickedRole === "string" ? search.searchAsRole(pickedRole, places) : search.searchNow({ locations: places });
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
