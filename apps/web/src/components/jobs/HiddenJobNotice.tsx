"use client";
import { useEffect } from "react";
import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CanonicalJob } from "@/domain/jobs/types";
import { explainJobVisibility, FILTER_REASON_FIX, FILTER_REASON_LABEL } from "@/domain/jobs/filterExplain";
import { useJobsStore } from "@/store/jobs";
import { useNow } from "@/lib/motion";
import { track } from "@/lib/analytics";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";

/**
 * "Why didn't Wonder show this job?" on the job itself (outcome spec §11): the one real reason it's
 * missing from the Jobs list right now — the same check the list uses — with "Show it anyway"
 * (clears only that filter, or undoes the rejection) and "Change preference".
 */
export function HiddenJobNotice({ job, className }: { job: CanonicalJob; className?: string }) {
  const router = useRouter();
  const now = useNow();
  const matches = useJobsStore((s) => s.matches);
  const rejected = useJobsStore((s) => s.rejected);
  const saved = useJobsStore((s) => s.saved);
  const filters = useJobsStore((s) => s.filters);
  const setFilters = useJobsStore((s) => s.setFilters);
  const unreject = useJobsStore((s) => s.unreject);
  const result = explainJobVisibility(job, matches, rejected, saved, filters, now);

  useEffect(() => {
    if (result.reason) track("why_filtered_viewed", { jobId: job.id, reason: result.reason });
  }, [job.id, result.reason]);

  if (result.visible || !result.reason) return null;
  const fix = FILTER_REASON_FIX[result.reason];
  const showAnyway = () => {
    if (fix.showAnyway === "unreject") {
      unreject(job.id);
      toast.success("Back in your results", "It's no longer marked not for me.");
    } else {
      setFilters(fix.showAnyway);
      toast.success("Filter cleared", `Jobs now include roles that are ${FILTER_REASON_LABEL[result.reason!]}.`);
      router.push("/app/jobs");
    }
  };
  return (
    <div role="status" className={`flex flex-col gap-3 rounded-[16px] border border-info-600/20 bg-info-100/50 p-4 sm:flex-row sm:items-center ${className ?? ""}`}>
      <EyeOff className="hidden size-5 shrink-0 text-info-600 sm:block" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] text-ink-2">
        <span className="font-semibold text-ink">Not in your main results right now.</span> Wonder found this role, but it&apos;s {FILTER_REASON_LABEL[result.reason]}, so your Jobs list hides it.
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" onClick={showAnyway}>
          Show it anyway
        </Button>
        <Button size="sm" variant="outline" href={fix.preference.href}>
          {fix.preference.label}
        </Button>
      </div>
    </div>
  );
}
