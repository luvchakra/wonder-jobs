"use client";
import { Sparkles } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";
import type { LearnedSignal } from "@/domain/career/learning";

const LABEL: Record<LearnedSignal["kind"], (value?: string) => string> = {
  avoid_industry: (v) => `Rank ${v ?? "this industry"} roles lower`,
  avoid_work_mode: (v) => `Rank ${v ?? "this work mode"} roles lower`,
  prefer_lower_seniority: () => "Rank more senior roles lower",
  prefer_higher_seniority: () => "Rank more junior roles lower",
};

/**
 * "Provide a way to review learned preferences" (spec §18) — what the reject-reason patterns in
 * `domain/career/learning.ts` are actually doing to ranking right now, in plain language, with a way
 * to turn any one of them off. Nothing here can be surprised by: every signal only exists because the
 * candidate rejected several similar roles and said why.
 */
export function LearnedPreferences() {
  const signals = useCareerStore((s) => s.learnedSignals);
  const confirm = useCareerStore((s) => s.confirmLearnedSignal);
  const dismiss = useCareerStore((s) => s.dismissLearnedSignal);

  if (!signals.length) return null;

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Sparkles className="size-4 text-brand-600" aria-hidden /> Needs confirmation
      </h2>
      <p className="mb-3 text-[12px] text-ink-3">Patterns Wonder noticed from marking roles &ldquo;not for me&rdquo; more than once for the same reason. Each one nudges ranking slightly — it never hides a role outright, and never changes the preferences above without you.</p>
      <ul className="flex flex-col gap-2">
        {signals.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">{LABEL[s.kind](s.value)}</p>
              <p className="text-[12px] text-ink-3">{s.evidence}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={s.confidence === "high" ? "brand" : "neutral"}>{s.status === "confirmed" ? "Confirmed" : "Suggested"}</Badge>
              {s.status !== "confirmed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    confirm(s.id);
                    toast.success("Confirmed", "Wonder will keep ranking this pattern lower.");
                  }}
                >
                  Yes, keep this
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismiss(s.id);
                  toast.info("Dismissed", "Wonder won't rank this pattern lower, and won't suggest it again.");
                }}
              >
                Turn off
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
