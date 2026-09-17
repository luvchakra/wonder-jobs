import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { JobQuality } from "@/domain/jobs/types";
import { Badge } from "@/components/common/Badge";

export function JobQualityBadge({ quality, className }: { quality: JobQuality; className?: string }) {
  const map = {
    high: { tone: "success" as const, label: "Hiring confidence: High", icon: ShieldCheck },
    moderate: { tone: "info" as const, label: "Hiring confidence: Moderate", icon: ShieldQuestion },
    low: { tone: "warning" as const, label: "Hiring confidence: Low", icon: ShieldAlert },
  }[quality.confidence];
  return (
    <Badge tone={map.tone} icon={<map.icon className="size-3.5" aria-hidden />} className={className} title={quality.summary}>
      {map.label}
    </Badge>
  );
}
