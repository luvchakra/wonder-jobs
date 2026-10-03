"use client";
import { useJobsStore } from "@/store/jobs";
import { useAuthStore } from "@/store/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/cn";

/**
 * Which job sources Wonder searches. Every source here is one Wonder actually reads; one that needs
 * credentials this deployment doesn't have says so instead of pretending to search.
 */
export default function JobSourcesPage() {
  const sources = useJobsStore((s) => s.sources).filter((s) => s.integrated);
  const setEnabled = useJobsStore((s) => s.setSourceEnabled);
  const mode = useAuthStore((s) => s.mode);
  const on = sources.filter((s) => s.enabled && s.available !== false).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Job sources" description={`${on} of ${sources.length} on. A source that's off is skipped next search.`} />
      <ul className="flex flex-col gap-2" aria-label="Job sources">
        {sources.map((s) => {
          const unavailable = s.available === false;
          const checked = s.enabled && !unavailable;
          return (
            <li key={s.id} className="wj-card flex items-start gap-3 p-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold text-white" style={{ background: s.color }} aria-hidden>
                {s.short}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  {s.name}
                  {unavailable && <Badge tone="warning">Needs setup</Badge>}
                </p>
                {s.note && <p className="mt-0.5 text-[13px] text-ink-3">{s.note}</p>}
                {unavailable && <p className="mt-0.5 text-[12px] text-ink-4">{mode === "user" ? "This deployment doesn't have the credentials for it yet, so it isn't searched." : "Not available here."}</p>}
              </div>
              <label className={cn("relative inline-flex shrink-0 items-center", unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
                <input type="checkbox" className="peer sr-only" checked={checked} disabled={unavailable} onChange={(e) => setEnabled(s.id, e.target.checked)} aria-label={`Search ${s.name}`} />
                <span className="h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300" aria-hidden />
                <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" aria-hidden />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
