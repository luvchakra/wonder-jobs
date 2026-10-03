"use client";
import type { HistoryReviewItem } from "@/domain/career/historyImport";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/cn";

const GROUPS: { key: HistoryReviewItem["group"]; title: string }[] = [
  { key: "contact", title: "Contact details" },
  { key: "summary", title: "Summary" },
  { key: "experience", title: "Work history" },
  { key: "education", title: "Education" },
  { key: "certifications", title: "Certifications" },
];

const STATUS = { new: "New", same: "Already in your profile", conflict: "Differs from your profile" } as const;

/**
 * The history half of a résumé import: one row per proposed entry, ticked or not, each saying where it
 * came from — Wonder's own reading or the candidate's AI model — and the résumé words behind it.
 */
export function HistoryImportReview({ items, chosen, onToggle }: { items: HistoryReviewItem[]; chosen: Set<string>; onToggle: (key: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(({ key, title }) => {
        const rows = items.filter((i) => i.group === key);
        if (!rows.length) return null;
        return (
          <section key={key} aria-label={title}>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
            <ul className="flex flex-col gap-2">
              {rows.map((r) => {
                const on = chosen.has(r.key);
                const same = r.status === "same";
                return (
                  <li key={r.key}>
                    <label className={cn("flex items-start gap-3 rounded-[14px] border bg-surface p-3", same ? "border-line opacity-75" : "cursor-pointer hover:border-line-strong", r.status === "conflict" ? "border-warning-600/40" : "border-line")}>
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--color-brand-600)]" checked={on} disabled={same} onChange={() => onToggle(r.key)} aria-label={`${r.label}${same ? " (already in your profile)" : ""}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold text-ink">{r.label}</span>
                          <Badge tone={r.status === "conflict" ? "warning" : same ? "neutral" : "info"}>{STATUS[r.status]}</Badge>
                          {r.by === "ai" && <Badge tone="brand">Found by AI</Badge>}
                        </span>
                        {r.status === "conflict" ? (
                          <span className="mt-1 grid grid-cols-1 gap-0.5 text-[13px] sm:grid-cols-2">
                            <span className="break-words text-ink-2">
                              <span className="text-ink-4">Your profile:</span> {r.current}
                            </span>
                            <span className="break-words text-ink-2">
                              <span className="text-ink-4">Résumé:</span> {r.incoming}
                            </span>
                          </span>
                        ) : (
                          r.incoming && <span className="mt-1 block break-words text-[13px] text-ink-2">{r.group === "summary" ? r.incoming.slice(0, 240) + (r.incoming.length > 240 ? "…" : "") : r.incoming}</span>
                        )}
                        <span className="mt-1 block truncate text-[12px] text-ink-4">From your résumé: {r.from}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
