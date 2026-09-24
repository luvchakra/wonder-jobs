"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SCHEDULE_TEMPLATES } from "@/services/mock/templates";
import type { LookFrequency } from "@/domain/workflow/simpleSchedule";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScheduleBuilder } from "@/components/automation/ScheduleBuilder";
import { SimpleScheduleSetup } from "@/components/automation/SimpleScheduleSetup";
import { PageLoading } from "@/components/common/States";

const FREQUENCIES: LookFrequency[] = ["daily", "weekly", "keep_watch", "manual"];

function NewScheduleInner() {
  const params = useSearchParams();
  const q = params.get("q");
  const templateId = params.get("template");
  // A template link (gallery, "Advanced search automation") opens the full builder — the existing
  // stages/conditions/actions/provider controls, unchanged. Everything else starts simple.
  if (templateId) {
    const base = SCHEDULE_TEMPLATES.find((t) => t.id === templateId) ?? SCHEDULE_TEMPLATES[0];
    // "Ask Wonder" scheduling hands off the candidate's own search text via ?q= — a starting value
    // to edit, never a silently created schedule.
    const template = q ? { ...base, query: q } : base;
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled searches" }} title="Advanced search automation" description={`Starting from “${base.name}”. Choose the steps, conditions and actions yourself.`} />
        <ScheduleBuilder key={`${template.id}:${q ?? ""}`} template={template} />
      </div>
    );
  }
  const often = params.get("often") as LookFrequency | null;
  const advancedHref = `/app/automation/scheduled/new?template=daily_discovery${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/app/automation/scheduled", label: "Scheduled searches" }} title="Keep Wonder looking" description="Wonder searches on its own and tells you what's worth your attention." />
      <SimpleScheduleSetup initialRequest={q ?? undefined} initialFrequency={often && FREQUENCIES.includes(often) ? often : undefined} advancedHref={advancedHref} />
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
