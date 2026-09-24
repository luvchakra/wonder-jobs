"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AI_PROVIDERS, type AIProviderId } from "@/domain/ai/types";
import type { AutomationLevel } from "@/domain/automation/policy";
import { STAGE_KEYS, STAGES, type StageKey } from "@/domain/workflow/stages";
import type { Workflow, WorkflowSchedule } from "@/domain/workflow/types";
import { describeSchedule, nextRunAt, SCHEDULE_TEMPLATES, type ScheduleTemplate } from "@/services/mock/templates";
import { useWorkflowStore } from "@/store/workflow";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { useAutomationStore } from "@/store/automation";
import { newId } from "@/lib/ids";
import { track } from "@/lib/analytics";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { ProviderSelector } from "@/components/ai/ProviderSelector";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Singapore", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"];

export function ScheduleBuilder({ existing, template }: { existing?: { schedule: WorkflowSchedule; workflow: Workflow }; template?: ScheduleTemplate }) {
  const router = useRouter();
  const sources = useJobsStore((s) => s.sources);
  const dna = useCareerStore((s) => s.dna);
  const aiConfig = useAIStore((s) => s.config);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const upsertSchedule = useWorkflowStore((s) => s.upsertSchedule);
  const upsertWorkflow = useWorkflowStore((s) => s.upsertWorkflow);
  const t = template ?? SCHEDULE_TEMPLATES[0];
  const wf = existing?.workflow;
  const sch = existing?.schedule;

  const [name, setName] = useState(sch?.name ?? t.name);
  const [description, setDescription] = useState(sch?.description ?? t.description);
  const [trigger, setTrigger] = useState<WorkflowSchedule["trigger"]>(sch?.trigger ?? "schedule");
  const [frequency, setFrequency] = useState<WorkflowSchedule["frequency"]>(sch?.frequency ?? t.frequency);
  const [days, setDays] = useState<number[]>(sch?.days ?? t.days);
  const [time, setTime] = useState(sch?.time ?? t.time);
  const [timezone, setTimezone] = useState(sch?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"));
  const [sourceIds, setSourceIds] = useState<string[]>(wf?.config.sourceIds ?? sources.filter((s) => s.enabled).map((s) => s.id));
  const [query, setQuery] = useState(wf?.config.searchCriteria.query ?? (t.query || defaultSearchQuery(dna)));
  const [locations, setLocations] = useState((wf?.config.searchCriteria.locations ?? dna.preferredLocations).join(", "));
  const [threshold, setThreshold] = useState(wf?.config.minMatchThreshold ?? 70);
  const [maxResults, setMaxResults] = useState(wf?.config.maxResults ?? 50);
  const [level, setLevel] = useState<AutomationLevel>(wf?.config.automationLevel ?? (t.id === "daily_discovery" ? "continuous" : defaultLevel));
  const [stageKeys, setStageKeys] = useState<StageKey[]>(wf?.stageKeys ?? t.stageKeys);
  const [actions, setActions] = useState<WorkflowSchedule["actions"]>(sch?.actions ?? t.actions);
  const [condition, setCondition] = useState<WorkflowSchedule["condition"]>(sch?.condition ?? t.condition);
  const [notify, setNotify] = useState<Workflow["config"]["notify"]>(wf?.config.notify ?? "strong_matches_only");
  const [provider, setProvider] = useState<AIProviderId>(wf?.config.provider.provider ?? aiConfig.activeProvider);
  const [model, setModel] = useState(wf?.config.provider.model ?? aiConfig.activeModel);

  const models = AI_PROVIDERS[provider].models;
  const preview = useMemo(() => describeSchedule({ frequency, days, time, timezone }), [frequency, days, time, timezone]);
  const toggleStage = (k: StageKey) => setStageKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...STAGE_KEYS].filter((x) => ks.includes(x) || x === k)));

  const [confirmedBroadMatch, setConfirmedBroadMatch] = useState(false);
  const save = () => {
    if (!name.trim()) return toast.error("Give the workflow a name");
    if (!stageKeys.length) return toast.error("Pick at least one stage");
    if (!query.trim() && !confirmedBroadMatch) {
      setConfirmedBroadMatch(true);
      toast.warning("No search term set", "This will match almost any role title. Click Save again to continue, or add a search term to narrow it down.");
      return;
    }
    const workflow: Workflow = {
      id: wf?.id ?? newId("wf"),
      name: name.trim(),
      description: description.trim(),
      version: (wf?.version ?? 0) + 1,
      template: wf?.template ?? t.id,
      config: {
        careerGoal: dna.careerGoal,
        automationLevel: level,
        provider: { provider, model, billing: AI_PROVIDERS[provider].billing },
        sourceIds,
        searchCriteria: { query: query.trim(), locations: locations.split(",").map((s) => s.trim()).filter(Boolean), workModes: dna.workModes, minSalary: dna.minSalary },
        minMatchThreshold: threshold,
        maxResults,
        notify,
      },
      stageKeys: [...STAGE_KEYS].filter((k) => stageKeys.includes(k)),
      createdAt: wf?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const schedule: WorkflowSchedule = {
      id: sch?.id ?? newId("sch"),
      workflowId: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: sch?.enabled ?? true,
      trigger,
      frequency,
      days,
      time,
      timezone,
      condition,
      actions,
      lastRunAt: sch?.lastRunAt,
      lastRunId: sch?.lastRunId,
      nextRunAt: trigger === "schedule" ? nextRunAt({ frequency, days, time, timezone }) : undefined,
      createdAt: sch?.createdAt ?? new Date().toISOString(),
    };
    upsertWorkflow(workflow);
    upsertSchedule(schedule);
    if (!sch) track("scheduled_run_created", { template: t.id, frequency });
    toast.success(sch ? "Schedule updated" : "Scheduled run created", trigger === "schedule" ? preview : "Runs when you trigger it.");
    router.push("/app/automation/scheduled");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Workflow</h2>
        <div className="grid gap-4">
          <Field label="Workflow name" htmlFor="wf-name" required>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Description" htmlFor="wf-desc">
            <Textarea id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Trigger &amp; schedule</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Trigger" htmlFor="trigger">
            <Select id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as WorkflowSchedule["trigger"])}>
              <option value="schedule">On a schedule</option>
              <option value="manual">Manual only</option>
              <option value="event">When my Career DNA changes</option>
            </Select>
          </Field>
          {trigger === "schedule" && (
            <>
              <Field label="Frequency" htmlFor="freq">
                <Select id="freq" value={frequency} onChange={(e) => setFrequency(e.target.value as WorkflowSchedule["frequency"])}>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </Field>
              {frequency === "weekly" && (
                <div className="sm:col-span-2">
                  <p className="mb-2 text-[13px] font-medium text-ink-2">Days</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_NAMES.map((d, i) => (
                      <Chip key={d} active={days.includes(i)} onClick={() => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i].sort()))} className="h-8 px-3 text-[12px]">
                        {d}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              {frequency === "monthly" && (
                <Field label="Day of month" htmlFor="dom" hint="1–28, so it runs the same date every month (29–31 don't exist in every month).">
                  <Input id="dom" type="number" min={1} max={28} value={days[0] ?? 1} onChange={(e) => setDays([Math.min(28, Math.max(1, Number(e.target.value)))])} />
                </Field>
              )}
              <Field label="Time" htmlFor="time">
                <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Timezone" htmlFor="tz">
                <Select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {[timezone, ...TIMEZONES.filter((z) => z !== timezone)].map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-[13px] text-ink-3 sm:col-span-2">
                Runs <strong className="text-ink">{preview}</strong> ({timezone}).
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Stages</h2>
        <p className="mb-3 text-[12px] text-ink-3">Stages always run in order. External application only runs when you allow it in What Wonder can do.</p>
        <ol className="flex flex-wrap gap-2">
          {STAGE_KEYS.map((k) => {
            const on = stageKeys.includes(k);
            const def = STAGES[k];
            return (
              <li key={k}>
                <Chip active={on} onClick={() => toggleStage(k)} className={cn(def.risk === "high" && !on && "border-dashed")}>
                  {def.name}
                  {def.risk !== "low" && <span className={cn("ml-1 text-[10px] uppercase", on ? "text-white/80" : def.risk === "high" ? "text-danger-600" : "text-warning-600")}>{def.risk}</span>}
                </Chip>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Search criteria</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Search query" htmlFor="q" hint="Optional — leave blank to match almost any role title.">
            <Input
              id="q"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setConfirmedBroadMatch(false);
              }}
              placeholder="e.g. product manager"
            />
          </Field>
          <Field label="Locations" htmlFor="loc" hint="Comma-separated">
            <Input id="loc" value={locations} onChange={(e) => setLocations(e.target.value)} />
          </Field>
          <Field label={`Minimum match threshold: ${threshold}`} htmlFor="thr">
            <input id="thr" type="range" min={50} max={95} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-brand-500" />
          </Field>
          <Field label="Maximum results" htmlFor="max">
            <Input id="max" type="number" min={5} max={200} value={maxResults} onChange={(e) => setMaxResults(Math.max(5, Math.min(200, Number(e.target.value))))} />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-medium text-ink-2">Sources</p>
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <Chip key={s.id} active={sourceIds.includes(s.id)} onClick={() => setSourceIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Conditions &amp; actions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Only continue if" htmlFor="cond">
            <Select id="cond" value={condition.key} onChange={(e) => setCondition({ key: e.target.value as WorkflowSchedule["condition"]["key"], op: ">", value: e.target.value === "always" ? 0 : condition.value })}>
              <option value="strong_matches">Strong matches &gt; threshold</option>
              <option value="new_jobs">New jobs &gt; threshold</option>
              <option value="always">Always</option>
            </Select>
          </Field>
          {condition.key !== "always" && (
            <Field label="Threshold" htmlFor="cond-v">
              <Input id="cond-v" type="number" min={0} value={condition.value} onChange={(e) => setCondition({ ...condition, value: Math.max(0, Number(e.target.value)) })} />
            </Field>
          )}
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-medium text-ink-2">Allowed actions</p>
            <div className="flex flex-wrap gap-2">
              {(["notify", "save_jobs", "prepare_materials"] as const).map((a) => (
                <Chip key={a} active={actions.includes(a)} onClick={() => setActions((as) => (as.includes(a) ? as.filter((x) => x !== a) : [...as, a]))}>
                  {{ notify: "Send notification", save_jobs: "Save strong matches", prepare_materials: "Prepare materials" }[a]}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Notification preference" htmlFor="notify" className="sm:col-span-2">
            <Select id="notify" value={notify} onChange={(e) => setNotify(e.target.value as Workflow["config"]["notify"])}>
              <option value="strong_matches_only">Only when there are strong matches (recommended)</option>
              <option value="always">After every run</option>
              <option value="never">Never — I&apos;ll check Runs myself</option>
            </Select>
          </Field>
          <p className="text-[12px] text-ink-4 sm:col-span-2">Silence is a valid outcome. When nothing meaningful happens, Wonder records the run and stays quiet.</p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Automation level</h2>
        <AutomationLevelSelector value={level} onChange={setLevel} compact />
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-semibold text-ink">AI provider &amp; model</h2>
        <ProviderSelector
          config={aiConfig}
          value={provider}
          onChange={(p) => {
            setProvider(p);
            setModel(AI_PROVIDERS[p].models.find((m) => m.default)?.id ?? AI_PROVIDERS[p].models[0].id);
          }}
        />
        {models.length > 1 && (
          <Field label="Model" htmlFor="model" className="mt-3">
            <Select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" href="/app/automation/scheduled">
          Cancel
        </Button>
        <Button size="lg" onClick={save}>
          {sch ? "Save changes" : "Create scheduled search"}
        </Button>
      </div>
    </div>
  );
}
