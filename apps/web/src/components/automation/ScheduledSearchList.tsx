"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Timer } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow";
import { describeSchedule, SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import { Fold } from "@/components/common/Fold";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Switch } from "@/components/common/Input";
import { EmptyState } from "@/components/common/States";

const CONDITION: Record<string, string> = { strong_matches: "strong matches", new_jobs: "new jobs" };

/** The scheduled searches section of Automation: one row per search — when it runs, what it waits for, how the last run went. On or off here; everything else on its own page. */
export function ScheduledSearchList() {
  const schedulesById = useWorkflowStore((s) => s.schedules);
  const runs = useWorkflowStore((s) => s.runs);
  const upsert = useWorkflowStore((s) => s.upsertSchedule);
  const schedules = useMemo(() => Object.values(schedulesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [schedulesById]);

  return (
    <section id="scheduled" aria-labelledby="scheduled-title" className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="scheduled-title" className="text-[17px] font-semibold text-ink">
            Scheduled searches
          </h2>
          <p className="text-[13px] text-ink-3">Wonder searches on its own and tells you only when something is worth it.</p>
        </div>
        <Button size="sm" href="/app/automation/scheduled/new" icon={<Plus className="size-4" aria-hidden />}>
          New
        </Button>
      </div>
      {schedules.length === 0 ? (
        <EmptyState icon={<Timer className="size-5" aria-hidden />} title="No scheduled searches" body="Wonder can search on its own and tell you only when something is worth your attention." action={{ label: "Set one up", href: "/app/automation/scheduled/new" }} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
          {schedules.map((s) => {
            const last = s.lastRunId ? runs[s.lastRunId] : undefined;
            const when = `${describeSchedule(s)}${s.condition.key === "always" ? "" : ` · only if ${CONDITION[s.condition.key] ?? s.condition.key.replace("_", " ")} ${s.condition.op} ${s.condition.value}`}`;
            const lastLine = s.lastRunAt
              ? `Last run ${relativeTime(s.lastRunAt)}${last?.status === "FAILED" ? " · didn't finish" : last?.silent ? " · nothing to report" : last?.summary.strongMatches ? ` · ${last.summary.strongMatches} strong match${last.summary.strongMatches === 1 ? "" : "es"}` : ""}`
              : "Hasn't run yet";
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <Link href={`/app/automation/scheduled/${s.id}`} className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[15px] font-semibold text-ink">
                    <span className="truncate">{s.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
                  </span>
                  <span className="block text-[13px] text-ink-2">{when}</span>
                  <span className={`block text-[12px] ${last?.status === "FAILED" ? "text-danger-600" : "text-ink-3"}`}>
                    {lastLine}
                    {s.enabled && s.nextRunAt ? ` · next ${relativeTime(s.nextRunAt)}` : !s.enabled ? " · paused" : ""}
                  </span>
                </Link>
                <Switch checked={s.enabled} onChange={(v) => upsert({ ...s, enabled: v })} label={`${s.name} on`} />
              </li>
            );
          })}
        </ul>
      )}
      <Fold title="Start from a template" className="mt-6">
        <ul className="divide-y divide-line">
          {SCHEDULE_TEMPLATES.map((t) => (
            <li key={t.id}>
              <Link href={`/app/automation/scheduled/new?template=${t.id}`} className="flex items-center gap-3 py-3 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-ink">{t.name}</span>
                  <span className="block text-[12px] text-ink-3">{t.description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Fold>
    </section>
  );
}
