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

export function FitLabel({ fit }: { fit: JobMatch["fit"] }) {
  const meta = FIT_META[fit];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
