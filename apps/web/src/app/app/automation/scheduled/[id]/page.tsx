"use client";
import { use } from "react";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScheduleBuilder } from "@/components/automation/ScheduleBuilder";
import { EmptyState } from "@/components/common/States";

export default function EditSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const schedule = useWorkflowStore((s) => s.schedules[id]);
  const workflow = useWorkflowStore((s) => (schedule ? s.workflows[schedule.workflowId] : undefined));
  if (!schedule || !workflow) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled runs" }} title="Schedule not found" />
        <EmptyState title="This schedule isn't available" action={{ label: "Back", href: "/app/automation/scheduled" }} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled runs" }} title={schedule.name} description={`Version ${workflow.version} · created ${new Date(schedule.createdAt).toLocaleDateString("en-IN")}`} />
      <ScheduleBuilder existing={{ schedule, workflow }} />
    </div>
  );
}
