"use client";
import Link from "next/link";
import { EyeOff, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import type { FilterReason, FilterResult } from "@/domain/jobs/filterExplain";
import { FILTER_REASON_LABEL } from "@/domain/jobs/filterExplain";
import { useUIStore } from "@/store/ui";

/** The exact patch that clears every preference-driven filter without touching search text — matches
 *  `JobFiltersBar`'s own internal "Clear filters" so "Show me anyway" behaves identically. */
export const CLEAR_FILTERS_PATCH = { workModes: [] as never[], locations: [] as string[], levels: [] as never[], jobTypes: [] as never[], company: "", salaryListed: false, strictProfile: false, hideInPipeline: false, sourceIds: [] as never[], minFit: null, exactFit: false, freshnessDays: null, minSalary: undefined, onlySaved: false, includeOld: true };

/** One filter's own undo, for when it is what hides the jobs: the patch, and the button's words. */
const ONE_FIX: Partial<Record<FilterReason, { patch: Record<string, unknown>; label: string }>> = {
  job_type: { patch: { jobTypes: [] }, label: "Show every job type" },
  work_mode: { patch: { workModes: [] }, label: "Show every work mode" },
  min_salary: { patch: { minSalary: undefined }, label: "Show any salary" },
  no_salary: { patch: { salaryListed: false }, label: "Include jobs without pay" },
  level: { patch: { levels: [] }, label: "Show every level" },
  location: { patch: { locations: [] }, label: "Show every place" },
  min_fit: { patch: { minFit: null, exactFit: false }, label: "Show every fit" },
  freshness: { patch: { freshnessDays: null }, label: "Show any date" },
  too_old: { patch: { includeOld: true }, label: "Show older jobs too" },
  source: { patch: { sourceIds: [] }, label: "Show every source" },
  company: { patch: { company: "" }, label: "Show every company" },
  in_pipeline: { patch: { hideInPipeline: false }, label: "Show jobs in my Pipeline" },
};

/** Hidden for reasons "Show me anyway" doesn't lift: the candidate's own "not for me", the other mode's kind of job (Part Time leaves out full-time jobs, and the other way round), and the words searched. */
const KEPT_HIDDEN: FilterReason[] = ["rejected", "other_mode", "search_text"];

const REASON_ORDER: FilterReason[] = ["rejected", "not_saved", "too_old", "work_mode", "source", "min_fit", "freshness", "min_salary", "no_salary", "level", "job_type", "other_mode", "company", "location", "profile", "in_pipeline", "search_text"];

/**
 * "Why Was This Filtered" (spec §11): whenever the candidate's active filters are hiding catalog jobs,
 * say plainly how many and why — never let "no results" or "fewer results than expected" pass without
 * an explanation the candidate can act on. Always pairs the two required actions: relax everything at
 * once, or go make the underlying preference change deliberately.
 */
export function FilteredBreakdown({ result, onShowAnyway, onFix, variant = "compact", search }: { result: FilterResult; onShowAnyway: () => void; /** Lifts one filter (the main reason) — kept in this mode's Refine. */ onFix?: (patch: Record<string, unknown>) => void; variant?: "compact" | "empty"; search?: { label: string | null; run: () => void; /** Only places were typed ("Singapore"). */ places?: string[] } }) {
  if (result.hiddenTotal === 0) return null;
  // How many "Show me anyway" would bring back; the button shows only when that's some.
  const revealable = result.hiddenTotal - KEPT_HIDDEN.reduce((n, r) => n + (result.hiddenByReason[r] ?? 0), 0);
  const reasons = REASON_ORDER.filter((r) => result.hiddenByReason[r]).sort((a, b) => (result.hiddenByReason[b] ?? 0) - (result.hiddenByReason[a] ?? 0));
  // "Show me anyway" clears every preference filter but never un-hides a job marked "not for me" —
  // that needs its own explicit undo (spec: never silently reverse a candidate's own rejection). Say
  // so whenever rejections are part of what's hidden, so the button's effect is never a surprise.
  const showAnywayNote = result.hiddenByReason.rejected ? `Won't bring back the ${result.hiddenByReason.rejected} job${result.hiddenByReason.rejected === 1 ? "" : "s"} you marked not for me — undo that from the job itself.` : "";

  if (variant === "empty" && search?.label) {
    // Nothing Wonder already has answers the words typed: search every source for them.
    return (
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Search className="size-5" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-ink">
          None of your {result.totalCatalog} jobs {search.places?.length ? `are in ${search.places.join(" or ")}` : "match"}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-ink-3">Search every source for {search.label}.</p>
        <Button className="mt-5" onClick={search.run} icon={<Search className="size-4" aria-hidden />}>
          Search every source
        </Button>
      </div>
    );
  }

  if (variant === "empty") {
    // The main reason leads, with its own one-tap fix; the rest are listed under it.
    const top = reasons[0];
    const fix = top && onFix ? ONE_FIX[top] : undefined;
    const n = top ? (result.hiddenByReason[top] ?? 0) : 0;
    const rest = reasons.slice(1);
    return (
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <EyeOff className="size-5" aria-hidden />
        </div>
        {fix ? (
          <>
            <h2 className="text-base font-semibold text-ink">
              {n} {n === 1 ? "job is" : "jobs are"} {FILTER_REASON_LABEL[top]}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-ink-3">Your Refine settings hide {n === result.totalCatalog ? "every job" : `${n} of the ${result.totalCatalog} jobs`} Wonder found.</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-ink">No jobs match right now</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-3">
              Wonder has {result.totalCatalog} discovered {result.totalCatalog === 1 ? "opportunity" : "opportunities"}, all hidden by your current filters — not a sign there&apos;s nothing out there.
            </p>
          </>
        )}
        {(fix ? rest : reasons).length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Why jobs are hidden">
            {(fix ? rest : reasons).map((r) => (
              <li key={r}>
                <Badge>
                  {result.hiddenByReason[r]} {FILTER_REASON_LABEL[r]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {fix ? (
            <Button size="sm" onClick={() => onFix!(fix.patch)}>
              {fix.label}
            </Button>
          ) : revealable > 0 ? (
            <Button size="sm" onClick={onShowAnyway} icon={<EyeOff className="size-4" aria-hidden />}>
              Show me anyway
            </Button>
          ) : null}
          {fix && revealable > (result.hiddenByReason[top] ?? 0) && (
            <Button size="sm" variant="outline" onClick={onShowAnyway} icon={<EyeOff className="size-4" aria-hidden />}>
              Show me anyway
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            icon={<SlidersHorizontal className="size-4" aria-hidden />}
            onClick={() => {
              useUIStore.getState().setRefineOpen(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Refine search options
          </Button>
          <Button size="sm" variant="ghost" href="/app/career-dna?from=find" icon={<UserRound className="size-4" aria-hidden />}>
            Update my Career Profile preferences
          </Button>
        </div>
        {showAnywayNote && <p className="mt-2 max-w-sm text-[12px] text-ink-4">{showAnywayNote}</p>}
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[13px]">
      <span className="text-ink-2">
        Showing {result.visibleIds.length} of {result.totalCatalog} — <span className="font-medium text-ink">{result.hiddenTotal} hidden</span>:{" "}
        {reasons.map((r, i) => (
          <span key={r}>
            {i > 0 && ", "}
            {result.hiddenByReason[r]} {FILTER_REASON_LABEL[r]}
          </span>
        ))}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {revealable > 0 && (
          <button type="button" onClick={onShowAnyway} title={showAnywayNote || undefined} className="inline-flex min-h-9 items-center font-medium text-brand-600 hover:underline">
            Show me anyway
          </button>
        )}
        <Link href="/app/career-dna?from=find" className="inline-flex min-h-9 items-center font-medium text-brand-600 hover:underline">
          Update Career Profile preferences
        </Link>
      </span>
    </div>
  );
}
