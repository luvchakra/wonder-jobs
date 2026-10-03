"use client";
import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { summarizeApplicationAttention } from "@/domain/career/attention";
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
    router.replace("/app");
  }, [params, search, router]);
  const firstName = dna.name.split(" ")[0];
  const needsYou = attention.applicationAttention.length;

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
      header={(found) => (
        <>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight text-ink md:text-[30px]">{found.total ? `${(found.strong + found.worth).toLocaleString("en-IN")} jobs for you` : "Jobs for you"}</h1>
            {found.total > 0 && (
              <p className="text-[13px] text-ink-3">
                {found.strong} strong · {found.worth} worth considering · ranked by fit with your Career Profile
              </p>
            )}
          </div>
          <SearchStatusLine search={search} />
          {roles.length > 0 && <RoleChips roles={roles} current={search.active?.config.role?.id ?? search.last?.config.role?.id ?? null} onPick={(id) => void (id ? search.searchAsRole(id) : search.searchNow())} busy={false} />}
          {attention.isMonitoring && (
            <p className="-mt-3 mb-4 text-[13px] text-ink-3">
              <Link href="/app/automation/scheduled" className="font-medium text-ink-2 hover:underline">
                Wonder keeps looking on your schedule
              </Link>
            </p>
          )}
          {needsYou > 0 && (
            <Link href="/app/applications" className="mb-4 flex items-center gap-2 rounded-[14px] border border-brand-200 bg-brand-50/60 px-3 py-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
              <BellRing className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0">{summarizeApplicationAttention(attention.applicationAttention)} ›</span>
            </Link>
          )}
          <RelevanceNoteBar notes={search.readiness.notes} />
        </>
      )}
      empty={<JobsEmpty search={search} />}
      sourceSearch={{
        run: (text) => {
          void search.searchWords(text).then((run) => {
            if (run) window.scrollTo({ top: 0, behavior: "smooth" });
          });
        },
        describe: (text) => {
          const d = describeWords(text, search.readiness.locations);
          return d.query ? `“${d.query}”${d.locations.length ? ` in ${d.locations.join(", ")}${d.fromWords ? "" : " (your places)"}` : ""}` : null;
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
