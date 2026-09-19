"use client";
import { useState } from "react";
import { ThumbsDown } from "lucide-react";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";
import { useJobsStore } from "@/store/jobs";
import { REJECTION_REASONS, type RejectionReason } from "@/domain/career/learning";

/**
 * "Not for me", with the reason capture the learning loop actually needs (spec §18: "Optionally ask
 * why… Allow skip… Use feedback in future ranking… Always provide Undo").
 *
 * A reason is what turns one rejection into a targeted signal (wrong industry, wrong work mode, too
 * senior/junior); skipping it still records the rejection, just without a pattern to attach it to.
 * Either way the toast now says only what actually happens — see `domain/career/learning.ts` for what
 * "influence future ranking" means here: nothing changes on the first rejection, and even a recognised
 * pattern only nudges score, never hides a job outright.
 */
export function NotForMeButton({ jobId, rejected, size = "lg", full = true }: { jobId: string; rejected: boolean; size?: "sm" | "md" | "lg" | "xl"; full?: boolean }) {
  const reject = useJobsStore((s) => s.reject);
  const unreject = useJobsStore((s) => s.unreject);
  const [asking, setAsking] = useState(false);

  if (rejected) {
    return (
      <Button size={size} full={full} variant="outline" icon={<ThumbsDown className="size-4" aria-hidden />} aria-pressed onClick={() => unreject(jobId)}>
        Undo not for me
      </Button>
    );
  }

  const finish = (reason?: RejectionReason) => {
    reject(jobId, reason);
    setAsking(false);
    toast.info("Marked not for me", "Wonder won't show this job again. Once you mark a few similar roles, it starts ranking that pattern lower too.", { label: "Undo", onClick: () => unreject(jobId) });
  };

  if (asking) {
    return (
      <div className="rounded-[14px] border border-line bg-surface p-3">
        <p className="mb-2 text-[12px] font-medium text-ink-2">Why? (optional — helps Wonder learn what to show less of)</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason not for me">
          {REJECTION_REASONS.map((r) => (
            <button key={r.value} type="button" onClick={() => finish(r.value)} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-line-strong hover:bg-bg-soft">
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="mt-2 text-[12px] font-medium text-ink-3 hover:text-ink hover:underline" onClick={() => finish(undefined)}>
          Skip
        </button>
      </div>
    );
  }

  return (
    <Button size={size} full={full} variant="outline" icon={<ThumbsDown className="size-4" aria-hidden />} onClick={() => setAsking(true)}>
      Not for me
    </Button>
  );
}
