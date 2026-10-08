"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { AI_PROVIDERS } from "@/domain/ai/types";
import type { Workflow, WorkflowSchedule } from "@/domain/workflow/types";
import { buildScheduledSearch, LOOK_FREQUENCY_META, type LookFrequency } from "@/domain/workflow/simpleSchedule";
import { defaultSearchQuery, profileSearchQuery } from "@/services/jobs/normalize";
import { deriveSearchIntent } from "@/services/jobs/searchIntent";
import { roleSearch } from "@/domain/career/roles";
import { RolePicker } from "@/components/career/RolePicker";
import { describeSchedule } from "@/services/mock/templates";
import { scheduleAllowance } from "@/domain/billing/plans";
import { usePlan } from "@/lib/usePlan";
import { PlanGate } from "@/components/billing/PlanGate";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useAIStore } from "@/store/ai";
import { useAutomationStore } from "@/store/automation";
import { useWorkflowStore } from "@/store/workflow";
import { newId } from "@/lib/ids";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";

const ORDER: LookFrequency[] = ["daily", "weekly", "keep_watch", "manual"];

/**
 * The simple way to keep Wonder looking. Writes the same Workflow + Schedule records the advanced
 * builder does (via `buildScheduledSearch`), so everything downstream — the scheduler, conditions,
 * quiet outcomes, automation policy — is the existing machinery.
 */
/** The frequency a saved schedule was set up with, read back from what buildScheduledSearch wrote. */
function frequencyOf(schedule: WorkflowSchedule, workflow: Workflow): LookFrequency {
  if (schedule.trigger === "manual") return "manual";
  if (workflow.config.automationLevel === "continuous") return "keep_watch";
  return schedule.frequency === "weekly" ? "weekly" : "daily";
}

/** `existing`: edit that schedule in place — same ids, its on/off state and run history kept. */
export function SimpleScheduleSetup({ initialRequest, initialFrequency, advancedHref, existing }: { initialRequest?: string; initialFrequency?: LookFrequency; advancedHref: string; existing?: { schedule: WorkflowSchedule; workflow: Workflow } }) {
  const router = useRouter();
  const dna = useCareerStore((s) => s.dna);
  const sources = useJobsStore((s) => s.sources);
  const aiConfig = useAIStore((s) => s.config);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const upsertWorkflow = useWorkflowStore((s) => s.upsertWorkflow);
  const upsertSchedule = useWorkflowStore((s) => s.upsertSchedule);
  const schedules = useWorkflowStore((s) => s.schedules);
  const { plan, plans } = usePlan();
  const [gate, setGate] = useState<{ reason: string; needs: "free" | "pro" | "max" | null } | null>(null);

  const roles = useCareerStore((s) => s.roles ?? []);
  const [roleId, setRoleId] = useState<string | null>(existing?.workflow.config.role?.id ?? null);
  const role = roles.find((r) => r.id === roleId);
  const [request, setRequest] = useState(existing?.workflow.config.careerGoal ?? initialRequest ?? dna.careerGoal);
  const [frequency, setFrequency] = useState<LookFrequency>(existing ? frequencyOf(existing.schedule, existing.workflow) : (initialFrequency ?? "daily"));
  const [onlyWorthIt, setOnlyWorthIt] = useState(existing ? existing.schedule.condition.key !== "always" : true);

  const intent = useMemo(() => deriveSearchIntent(request), [request]);
  // The candidate's own words, else their Career Profile — never a canned role.
  // A role's own terms; else the candidate's own words, else their Career Profile — never a canned role.
  const query = (role && roleSearch(role, defaultSearchQuery).query) || intent.query || profileSearchQuery(dna);
  const locations = intent.locations.length ? intent.locations : dna.preferredLocations;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

  const save = () => {
    // The plan decides how many searches may be on at once and how often they may run.
    const others = Object.values(schedules).filter((s) => s.enabled && s.id !== existing?.schedule.id).length;
    const allowance = scheduleAllowance(plan, { plans, priceRefs: { pro: {}, max: {} } }, others, frequency);
    if (!allowance.ok) {
      setGate(allowance);
      return;
    }
    setGate(null);
    const { workflow, schedule } = buildScheduledSearch({
      ids: existing ? { workflow: existing.workflow.id, schedule: existing.schedule.id } : { workflow: newId("wf"), schedule: newId("sch") },
      now: new Date(),
      timezone,
      frequency,
      onlyWhenWorthIt: onlyWorthIt,
      careerGoal: request.trim() || dna.careerGoal,
      query,
      locations,
      workModes: intent.workModes.length ? intent.workModes : dna.workModes,
      minSalary: dna.minSalary,
      level: defaultLevel,
      provider: { provider: aiConfig.activeProvider, model: aiConfig.activeModel, billing: AI_PROVIDERS[aiConfig.activeProvider].billing },
      sourceIds: sources.filter((s) => s.enabled).map((s) => s.id),
      role: role ? { id: role.id, title: role.title } : undefined,
    });
    if (existing) {
      const { createdAt, enabled, lastRunAt, lastRunId } = existing.schedule;
      upsertWorkflow({ ...workflow, version: existing.workflow.version + 1, createdAt: existing.workflow.createdAt });
      upsertSchedule({ ...schedule, createdAt, enabled, lastRunAt, lastRunId });
      toast.success("Saved", describeSchedule({ ...schedule, timezone }));
    } else {
      upsertWorkflow(workflow);
      upsertSchedule(schedule);
      track("search_schedule_created", { frequency, quiet: frequency === "keep_watch" || onlyWorthIt });
      toast.success(frequency === "manual" ? "Search saved" : "Wonder will keep looking", frequency === "manual" ? "Run it from Scheduled searches whenever you like." : describeSchedule({ ...schedule, timezone }));
    }
    router.push("/app/automation/settings#scheduled");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {roles.length > 0 && (
          <div className="mb-4">
            <RolePicker
              roles={roles}
              value={roleId}
              onChange={(id) => {
                setRoleId(id);
                const r = roles.find((x) => x.id === id);
                setRequest(r ? r.goal || r.title : (initialRequest ?? dna.careerGoal));
              }}
            />
          </div>
        )}
        <Field label="What should Wonder look for?" htmlFor="sched-request" hint={query ? `Searches for “${query}”${locations.length ? ` in ${locations.join(", ")}` : ""}.` : "Name a role — e.g. “product manager” — so Wonder knows what to search for."}>
          <Input id="sched-request" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. Director roles in fintech, Bengaluru or remote" />
        </Field>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">How often should Wonder look?</h2>
        <div role="radiogroup" aria-label="How often should Wonder look?" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ORDER.map((f) => {
            const active = frequency === f;
            return (
              <button key={f} type="button" role="radio" aria-checked={active} onClick={() => setFrequency(f)} className={cn("flex items-start gap-3 rounded-[14px] border p-3 text-left transition-colors", active ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-100" : "border-line bg-surface hover:border-line-strong")}>
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong")} aria-hidden>
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span>
                  <span className={cn("block text-[14px] font-semibold", active ? "text-brand-700" : "text-ink")}>{LOOK_FREQUENCY_META[f].label}</span>
                  <span className="block text-[12px] text-ink-3">{LOOK_FREQUENCY_META[f].description}</span>
                </span>
              </button>
            );
          })}
        </div>
        {frequency !== "manual" && (
          <label className="mt-4 flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand-600)]" checked={frequency === "keep_watch" || onlyWorthIt} disabled={frequency === "keep_watch"} onChange={(e) => setOnlyWorthIt(e.target.checked)} />
            <span>Only notify me when something worth my attention appears</span>
          </label>
        )}
        <p className="mt-3 text-[12px] text-ink-3">Scheduled searches find and compare opportunities. They never prepare or send anything on their own — for that, use advanced search automation.</p>
      </Card>

      {gate && <PlanGate reason={gate.reason} needs={gate.needs} plans={plans} />}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={advancedHref} className="text-center text-[13px] font-medium text-brand-600 hover:underline">
          Advanced search automation
        </Link>
        <Button onClick={save} disabled={!query}>
          {existing ? "Save changes" : frequency === "manual" ? "Save this search" : "Start looking"}
        </Button>
      </div>
    </div>
  );
}
