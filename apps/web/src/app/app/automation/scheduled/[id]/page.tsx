"use client";
import { Suspense, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Play, Trash2 } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow";
import { getWorkflowService } from "@/services/workflow/service";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScheduleBuilder } from "@/components/automation/ScheduleBuilder";
import { SimpleScheduleSetup } from "@/components/automation/SimpleScheduleSetup";
import { Button, IconButton } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";

function EditScheduleInner({ id }: { id: string }) {
  const router = useRouter();
  // ?advanced=1 opens the full builder (stages, conditions, actions, provider); the page itself is the short form.
  const advanced = useSearchParams().get("advanced") === "1";
  const schedule = useWorkflowStore((s) => s.schedules[id]);
  const workflow = useWorkflowStore((s) => (schedule ? s.workflows[schedule.workflowId] : undefined));
  const upsert = useWorkflowStore((s) => s.upsertSchedule);
  const remove = useWorkflowStore((s) => s.removeSchedule);
  const duplicate = useWorkflowStore((s) => s.duplicateSchedule);
  if (!schedule || !workflow) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled searches" }} title="Schedule not found" />
        <EmptyState title="This schedule isn't available" action={{ label: "Back", href: "/app/automation/scheduled" }} />
      </div>
    );
  }
  const runNow = () => {
    try {
      const run = getWorkflowService().startRun({ workflowId: workflow.id, workflowName: workflow.name, config: { ...workflow.config, scheduleCondition: schedule.condition }, stageKeys: workflow.stageKeys, trigger: "schedule" });
      upsert({ ...schedule, lastRunAt: new Date().toISOString(), lastRunId: run.id });
      router.push(`/app/runs/${run.id}`);
    } catch (e) {
      toast.error("Couldn't start", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/app/automation/scheduled", label: "Scheduled searches" }}
        title={schedule.name}
        actions={
          <>
            <Button size="sm" variant="outline" icon={<Play className="size-4" aria-hidden />} onClick={runNow}>
              Run now
            </Button>
            <IconButton
              label="Duplicate"
              onClick={() => {
                const c = duplicate(schedule.id);
                if (!c) return;
                track("scheduled_run_created", { template: workflow.template, duplicated: true });
                toast.success("Duplicated", `“${c.name}” is paused until you turn it on.`);
                router.push(`/app/automation/scheduled/${c.id}`);
              }}
            >
              <Copy className="size-4" aria-hidden />
            </IconButton>
            <IconButton
              label="Delete"
              onClick={() => {
                remove(schedule.id);
                // No confirm dialog: Undo brings it straight back, and its run history is kept either way.
                toast.info("Schedule removed", "Its run history is kept.", { label: "Undo", onClick: () => upsert(schedule) });
                router.push("/app/automation/scheduled");
              }}
            >
              <Trash2 className="size-4 text-danger-600" aria-hidden />
            </IconButton>
          </>
        }
      />
      {advanced ? <ScheduleBuilder existing={{ schedule, workflow }} /> : <SimpleScheduleSetup key={workflow.version} existing={{ schedule, workflow }} advancedHref={`/app/automation/scheduled/${schedule.id}?advanced=1`} />}
    </div>
  );
}

export default function EditSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageLoading />}>
      <EditScheduleInner id={id} />
    </Suspense>
  );
}
