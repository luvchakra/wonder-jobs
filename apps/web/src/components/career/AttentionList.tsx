import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/common/Card";
import { cn } from "@/lib/cn";

export interface AttentionRow {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  tone?: "warning" | "danger" | "info" | "neutral";
}

const TONE_CLS: Record<NonNullable<AttentionRow["tone"]>, string> = {
  warning: "bg-warning-100 text-warning-600",
  danger: "bg-danger-100 text-danger-600",
  info: "bg-blue-100 text-blue-600",
  neutral: "bg-surface-2 text-ink-3",
};

/** A short, prioritized list of things needing the candidate's attention — never a table. */
export function AttentionList({ rows }: { rows: AttentionRow[] }) {
  return (
    <Card padding="none" className="divide-y divide-line">
      {rows.map((r) => (
        <Link key={r.key} href={r.href} className="flex items-center gap-3 p-4 hover:bg-surface-2/60">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", TONE_CLS[r.tone ?? "neutral"])}>
            <r.icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-[14px] text-ink-2">{r.label}</span>
          <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
        </Link>
      ))}
    </Card>
  );
}
