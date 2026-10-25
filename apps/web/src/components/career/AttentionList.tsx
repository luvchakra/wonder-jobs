import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/cn";

export interface AttentionRow {
  key: string;
  href: string;
  label: string;
  /** The thing it's about — one line, truncated. */
  detail?: string;
  icon: LucideIcon;
  tone?: "warning" | "danger" | "info" | "neutral";
  /** The one thing to do, as a button at the row's end (else a chevron). */
  action?: { label: string; href: string };
}

const TONE_CLS: Record<NonNullable<AttentionRow["tone"]>, string> = {
  warning: "bg-warning-100 text-warning-600",
  danger: "bg-danger-100 text-danger-600",
  info: "bg-blue-100 text-blue-600",
  neutral: "bg-surface-2 text-ink-3",
};

/** A short, prioritized list of things needing the candidate's attention — never a table. Compact rows; a row with
 *  an action carries it as its one button. */
export function AttentionList({ rows }: { rows: AttentionRow[] }) {
  return (
    <Card padding="none" className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 px-3 py-2.5">
          <Link href={r.href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE_CLS[r.tone ?? "neutral"])}>
              <r.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[13.5px] text-ink", r.detail && "font-medium")}>{r.label}</span>
              {r.detail && <span className="block truncate text-[12px] text-ink-3">{r.detail}</span>}
            </span>
            {!r.action && <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />}
          </Link>
          {r.action && (
            <Button size="sm" variant="outline" href={r.action.href} className="shrink-0">
              {r.action.label}
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
