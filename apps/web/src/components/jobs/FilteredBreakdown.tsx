"use client";
import Link from "next/link";
import { EyeOff, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import type { FilterReason, FilterResult } from "@/domain/jobs/filterExplain";
import { FILTER_REASON_LABEL } from "@/domain/jobs/filterExplain";

/** The exact patch that clears every preference-driven filter without touching search text — matches
 *  `JobFiltersBar`'s own internal "Clear filters" so "Show me anyway" behaves identically. */
export const CLEAR_FILTERS_PATCH = { workModes: [] as never[], sourceIds: [] as never[], minFit: null, freshnessDays: null, minSalary: undefined, onlySaved: false };

const REASON_ORDER: FilterReason[] = ["rejected", "not_saved", "work_mode", "source", "min_fit", "freshness", "min_salary", "search_text"];

/**
 * "Why Was This Filtered" (spec §11): whenever the candidate's active filters are hiding catalog jobs,
 * say plainly how many and why — never let "no results" or "fewer results than expected" pass without
 * an explanation the candidate can act on. Always pairs the two required actions: relax everything at
 * once, or go make the underlying preference change deliberately.
 */
export function FilteredBreakdown({ result, onShowAnyway, variant = "compact" }: { result: FilterResult; onShowAnyway: () => void; variant?: "compact" | "empty" }) {
  if (result.hiddenTotal === 0) return null;
  const reasons = REASON_ORDER.filter((r) => result.hiddenByReason[r]).sort((a, b) => (result.hiddenByReason[b] ?? 0) - (result.hiddenByReason[a] ?? 0));
  // "Show me anyway" clears every preference filter but never un-hides a job marked "not for me" —
  // that needs its own explicit undo (spec: never silently reverse a candidate's own rejection). Say
  // so whenever rejections are part of what's hidden, so the button's effect is never a surprise.
  const showAnywayNote = result.hiddenByReason.rejected ? `Won't bring back the ${result.hiddenByReason.rejected} job${result.hiddenByReason.rejected === 1 ? "" : "s"} you marked not for me — undo that from the job itself.` : "";

  if (variant === "empty") {
    return (
      <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <EyeOff className="size-5" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-ink">No jobs match right now</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-3">
          Wonder has {result.totalCatalog} discovered {result.totalCatalog === 1 ? "opportunity" : "opportunities"}, all hidden by your current filters — not a sign there&apos;s nothing out there.
        </p>
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label="Why jobs are hidden">
          {reasons.map((r) => (
            <li key={r}>
              <Badge>
                {result.hiddenByReason[r]} {FILTER_REASON_LABEL[r]}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onShowAnyway} icon={<EyeOff className="size-4" aria-hidden />}>
            Show me anyway
          </Button>
          <Button size="sm" variant="outline" href="/app/career-dna" icon={<SlidersHorizontal className="size-4" aria-hidden />}>
            Change my preferences
          </Button>
        </div>
        {showAnywayNote && <p className="mt-2 max-w-sm text-[12px] text-ink-4">{showAnywayNote}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[13px]">
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
        <button type="button" onClick={onShowAnyway} title={showAnywayNote || undefined} className="font-medium text-brand-600 hover:underline">
          Show me anyway
        </button>
        <Link href="/app/career-dna" className="font-medium text-brand-600 hover:underline">
          Change preferences
        </Link>
      </span>
    </div>
  );
}
