"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Copy, Play, Plus, Timer, Trash2 } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow";
import { getWorkflowService } from "@/services/workflow/service";
import { describeSchedule, SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import { relativeTime } from "@/lib/format";
import { STAGES } from "@/domain/workflow/stages";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button, IconButton } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Switch } from "@/components/common/Input";
import { EmptyState } from "@/components/common/States";
import { RunStatusPill } from "@/components/workflow/RunStatusPill";
import { toast } from "@/components/feedback/Toast";
import { useRouter } from "next/navigation";

export default function ScheduledRunsPage() {
  const router = useRouter();
  const schedulesById = useWorkflowStore((s) => s.schedules);
  const workflows = useWorkflowStore((s) => s.workflows);
  const runs = useWorkflowStore((s) => s.runs);
  const upsert = useWorkflowStore((s) => s.upsertSchedule);
  const remove = useWorkflowStore((s) => s.removeSchedule);
  const duplicate = useWorkflowStore((s) => s.duplicateSchedule);
  const schedules = useMemo(() => Object.values(schedulesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [schedulesById]);

  const runNow = (id: string) => {
    const s = schedulesById[id];
    const wf = workflows[s.workflowId];
    if (!wf) return toast.error("Workflow missing", "Edit the schedule to fix its workflow.");
    try {
      const run = getWorkflowService().startRun({ workflowId: wf.id, workflowName: wf.name, config: { ...wf.config, scheduleCondition: s.condition }, stageKeys: wf.stageKeys, trigger: "schedule" });
      upsert({ ...s, lastRunAt: new Date().toISOString(), lastRunId: run.id });
      router.push(`/app/runs/${run.id}`);
    } catch (e) {
      toast.error("Couldn't start", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="Scheduled searches"
        description="Workflow → Trigger → Schedule → Stages → Conditions → Actions. These run on Wonder's servers as well as in your browser, so a run still happens while you're away. Silence is a valid outcome: Wonder only notifies you when there's something worth your attention."
        actions={
          <Button href="/app/automation/scheduled/new" icon={<Plus className="size-4" aria-hidden />}>
            New scheduled search
          </Button>
        }
      />
      {schedules.length === 0 ? (
        <EmptyState icon={<Timer className="size-5" aria-hidden />} title="No scheduled searches" body="Start from a template — Daily Job Discovery takes a minute to set up." action={{ label: "Create one", href: "/app/automation/scheduled/new" }} />
      ) : (
        <ul className="flex flex-col gap-3">
          {schedules.map((s) => {
            const wf = workflows[s.workflowId];
            const last = s.lastRunId ? runs[s.lastRunId] : undefined;
            return (
              <li key={s.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/app/automation/scheduled/${s.id}`} className="text-[16px] font-semibold text-ink hover:underline">
                          {s.name}
                        </Link>
                        <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "Active" : "Paused"}</Badge>
                        {wf?.template && <Badge>{SCHEDULE_TEMPLATES.find((t) => t.id === wf.template)?.name ?? wf.template}</Badge>}
                      </div>
                      <p className="mt-1 text-[13px] text-ink-3">{s.description}</p>
                      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt className="text-ink-4">Schedule</dt>
                          <dd className="font-medium text-ink">
                            {describeSchedule(s)} <span className="font-normal text-ink-3">({s.timezone})</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-4">Stages</dt>
                          <dd className="font-medium text-ink">{wf ? wf.stageKeys.map((k) => STAGES[k].name.split(" ")[0]).join(" → ") : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-4">Condition</dt>
                          <dd className="font-medium text-ink">{s.condition.key === "always" ? "Always" : `Only if ${s.condition.key.replace("_", " ")} ${s.condition.op} ${s.condition.value}`}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-4">Actions</dt>
                          <dd className="font-medium text-ink">{s.actions.map((a) => a.replace("_", " ")).join(", ") || "None"}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                        {s.lastRunAt ? (
                          <>
                            Last run {relativeTime(s.lastRunAt)} {last && <RunStatusPill status={last.status} />}
                            {last?.silent && <span className="text-ink-4">· quiet — nothing to report</span>}
                          </>
                        ) : (
                          "Hasn't run yet"
                        )}
                        {s.nextRunAt && s.enabled && <span>· Next {relativeTime(s.nextRunAt)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={s.enabled} onChange={(v) => upsert({ ...s, enabled: v })} label={`${s.name} enabled`} />
                      <IconButton label="Run now" onClick={() => runNow(s.id)}>
                        <Play className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label="Duplicate"
                        onClick={() => {
                          const c = duplicate(s.id);
                          if (c) {
                            track("scheduled_run_created", { template: wf?.template, duplicated: true });
                            toast.success("Duplicated", `“${c.name}” is paused until you enable it.`);
                          }
                        }}
                      >
                        <Copy className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        onClick={() => {
                          remove(s.id);
                          // No confirm dialog: deleting is fully reversible for a few seconds via Undo,
                          // and its run history stays intact either way (removeSchedule only drops the
                          // schedule row, not the workflow or past runs).
                          toast.info("Schedule removed", "Its run history is kept.", { label: "Undo", onClick: () => upsert(s) });
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-[17px] font-semibold text-ink">Templates</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {SCHEDULE_TEMPLATES.map((t) => (
            <Link key={t.id} href={`/app/automation/scheduled/new?template=${t.id}`} className="wj-card wj-elevate flex flex-col p-4">
              <span className="text-[14px] font-semibold text-ink">{t.name}</span>
              <span className="mt-1 flex-1 text-[12px] text-ink-3">{t.description}</span>
              <span className="mt-3 text-[12px] font-medium text-brand-600">Use template ›</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
