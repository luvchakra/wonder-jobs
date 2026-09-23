import { CheckCircle2 } from "lucide-react";
import { FIT_META, type JobMatch } from "@/domain/jobs/types";
import { Badge } from "@/components/common/Badge";

/** Match score with an explanatory fit label — never presented as an absolute number alone. */
export function MatchBadge({ match, showLabel = false, className }: { match: JobMatch; showLabel?: boolean; className?: string }) {
  const meta = FIT_META[match.fit];
  return (
    <Badge tone={meta.tone} icon={<CheckCircle2 className="size-3.5" aria-hidden />} className={className} title={`${meta.label} — about ${match.score}% aligned with your Career DNA`}>
      {match.score}% match{showLabel ? ` · ${meta.label}` : ""}
    </Badge>
  );
}

/** The concise, evidence-based label alone — for a scan-first surface like a job card. The score
 * (a guide, never presented as objective truth) is available on hover and in full on the "Why
 * it's a match" tab, not printed here. */
export function FitLabel({ fit, score }: { fit: JobMatch["fit"]; score?: number }) {
  const meta = FIT_META[fit];
  return (
    <Badge tone={meta.tone} icon={<CheckCircle2 className="size-3.5" aria-hidden />} title={score != null ? `About ${score}% aligned with your Career DNA — a guide, not a verdict` : undefined}>
      {meta.label}
    </Badge>
  );
}
