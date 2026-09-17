"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScheduleBuilder } from "@/components/automation/ScheduleBuilder";
import { PageLoading } from "@/components/common/States";

function NewScheduleInner() {
  const params = useSearchParams();
  const template = SCHEDULE_TEMPLATES.find((t) => t.id === params.get("template")) ?? SCHEDULE_TEMPLATES[0];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled runs" }} title="New scheduled run" description={`Based on the “${template.name}” template. Change anything you like.`} />
      <ScheduleBuilder key={template.id} template={template} />
    </div>
  );
}

export default function NewSchedulePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewScheduleInner />
    </Suspense>
  );
}
