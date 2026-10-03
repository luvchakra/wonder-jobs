"use client";
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { describeWords, useJobSearch } from "@/lib/useJobSearch";
import { PageLoading } from "@/components/common/States";
import { JobsBoard } from "@/components/jobs/JobsBoard";
import { JobsEmpty, ReadinessBlockerCard, RelevanceNoteBar, RoleChips, SearchStatusLine } from "@/components/jobs/JobsReadiness";

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
    <JobsBoard
      header={search.active ? <SearchStatusLine search={search} monitoring={attention.isMonitoring} /> : null}
      // What was searched and "Search as" live in Refine — the list stays the page.
      refineTop={
        search.active && roles.length === 0 ? null : (
          <>
            {!search.active && <SearchStatusLine search={search} monitoring={attention.isMonitoring} />}
            {roles.length > 0 && <RoleChips roles={roles} current={search.active?.config.role?.id ?? search.last?.config.role?.id ?? null} onPick={(id) => void (id ? search.searchAsRole(id) : search.searchNow())} busy={false} />}
          </>
        )
      }
      footer={
        <div className="mt-6">
          <h1 className="wj-sr-only">Find jobs</h1>
          <RelevanceNoteBar notes={search.readiness.notes} />
        </div>
      }
      empty={<JobsEmpty search={search} />}
      sourceSearch={{
        run: (text, places) => {
          // The candidate's own search shows everything it finds, best answer first — not only profile fits.
          useJobsStore.getState().setFilters({ minFit: null });
          void search.searchWords(text, places).then((run) => {
            if (run) window.scrollTo({ top: 0, behavior: "smooth" });
          });
        },
        describe: (text, places) => {
          const d = describeWords(text, search.readiness.locations, places);
          return d.query ? `“${d.query}”${d.locations.length ? ` in ${d.locations.join(", ")}` : " anywhere"}` : null;
        },
        places: search.readiness.locations,
        runPlaces: (places) => {
          void search.searchNow({ locations: places }).then((run) => {
            if (run) window.scrollTo({ top: 0, behavior: "smooth" });
          });
        },
      }}
    />
  );
}

export default function JobsHomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <JobsHome />
    </Suspense>
  );
}
