"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScheduleBuilder } from "@/components/automation/ScheduleBuilder";
import { PageLoading } from "@/components/common/States";

function NewScheduleInner() {
  const params = useSearchParams();
  const base = SCHEDULE_TEMPLATES.find((t) => t.id === params.get("template")) ?? SCHEDULE_TEMPLATES[0];
  // "Ask Wonder" scheduling (e.g. "search for backend engineer roles weekly") hands off the
  // candidate's own search text via ?q= — a real starting value to edit, never a silently
  // created schedule; the candidate still reviews and confirms everything below.
  const q = params.get("q");
  const template = q ? { ...base, query: q } : base;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled runs" }} title="New scheduled run" description={`Based on the “${base.name}” template. Change anything you like.`} />
      <ScheduleBuilder key={`${template.id}:${q ?? ""}`} template={template} />
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
