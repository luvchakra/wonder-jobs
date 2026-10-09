"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Play, Plus, Timer, Trash2 } from "lucide-react";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { roleSearch } from "@/domain/career/roles";
import { scheduleAllowance } from "@/domain/billing/plans";
import { nextScheduledRun } from "@/domain/workflow/schedule";
import { buildFromTemplate, CADENCES, cadenceId, SEARCH_TEMPLATES, type SearchTemplate } from "@/domain/workflow/searchTemplates";
import type { WorkflowSchedule } from "@/domain/workflow/types";
import { defaultSearchQuery, profileSearchQuery } from "@/services/jobs/normalize";
import { describeSchedule } from "@/services/mock/templates";
import { getWorkflowService } from "@/services/workflow/service";
import { useAIStore } from "@/store/ai";
import { useAutomationStore } from "@/store/automation";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { usePlan } from "@/lib/usePlan";
import { newId } from "@/lib/ids";
import { track } from "@/lib/analytics";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Fold } from "@/components/common/Fold";
import { Button } from "@/components/common/Button";
import { Select, Switch } from "@/components/common/Input";
import { EmptyState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";

const CONDITION: Record<string, string> = { strong_matches: "strong matches", new_jobs: "new jobs" };
const QUIET = { key: "strong_matches", op: ">", value: 0 } as const;
const ALWAYS = { key: "always", op: ">", value: 0 } as const;

/**
 * The scheduled searches section of Automation. Searching (and comparing and ranking what it finds) is the
 * only work Wonder does on its own on a schedule, so every item here is a search. Each can be changed in
 * place — how often, when it tells you, run now, delete; the search itself is edited on its own page.
 */
export function ScheduledSearchList() {
  const router = useRouter();
  const schedulesById = useWorkflowStore((s) => s.schedules);
  const workflows = useWorkflowStore((s) => s.workflows);
  const runs = useWorkflowStore((s) => s.runs);
  const upsert = useWorkflowStore((s) => s.upsertSchedule);
  const upsertWorkflow = useWorkflowStore((s) => s.upsertWorkflow);
  const remove = useWorkflowStore((s) => s.removeSchedule);
  const dna = useCareerStore((s) => s.dna);
  const roles = useCareerStore((s) => s.roles ?? []);
  const sources = useJobsStore((s) => s.sources);
  const aiConfig = useAIStore((s) => s.config);
  const level = useAutomationStore((s) => s.defaultLevel);
  const { plan, plans } = usePlan();
  const [open, setOpen] = useState<string | null>(null);
  const schedules = useMemo(() => Object.values(schedulesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [schedulesById]);

  /** The plan decides how many searches may be on at once and how often they may run. */
  const allowed = (cadence: Pick<WorkflowSchedule, "frequency">, except?: string) => {
    // Read fresh: one click may add several searches.
    const others = Object.values(useWorkflowStore.getState().schedules).filter((s) => s.enabled && s.id !== except).length;
    const a = scheduleAllowance(plan, { plans, priceRefs: { pro: {}, max: {} } }, others, cadence.frequency === "weekly" || cadence.frequency === "monthly" ? "weekly" : "daily");
    if (!a.ok) toast.error(a.reason, a.needs ? `Included in ${plans[a.needs].label} — see Account → Plan.` : undefined);
    return a.ok;
  };

  // What a ready-made search looks for: the candidate's Career Profile — never a canned role.
  const profileQuery = profileSearchQuery(dna);
  const add = (t: SearchTemplate, role?: (typeof roles)[number]) => {
    const query = role ? roleSearch(role, defaultSearchQuery).query : profileQuery;
    if (!query) return router.push("/app/automation/scheduled/new");
    if (!allowed(t.cadence)) return false;
    const { workflow, schedule } = buildFromTemplate(t, {
      ids: { workflow: newId("wf"), schedule: newId("sch") },
      now: new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      careerGoal: role ? roleSearch(role, defaultSearchQuery).careerGoal : dna.careerGoal,
      query,
      locations: dna.preferredLocations,
      workModes: dna.workModes,
      minSalary: dna.minSalary,
      level,
      provider: { provider: aiConfig.activeProvider, model: aiConfig.activeModel, billing: AI_PROVIDERS[aiConfig.activeProvider].billing },
      sourceIds: sources.filter((s) => s.enabled).map((s) => s.id),
      role: role ? { id: role.id, title: role.title } : undefined,
    });
    upsertWorkflow(workflow);
    upsert(schedule);
    track("search_schedule_created", { template: t.id });
    return true;
  };

  const runNow = (s: WorkflowSchedule) => {
    const workflow = workflows[s.workflowId];
    if (!workflow) return;
    try {
      const run = getWorkflowService().startRun({ workflowId: workflow.id, workflowName: workflow.name, config: { ...workflow.config, scheduleCondition: s.condition }, stageKeys: workflow.stageKeys, trigger: "schedule" });
      upsert({ ...s, lastRunAt: new Date().toISOString(), lastRunId: run.id });
      toast.success("Searching now", undefined, { label: "Watch", onClick: () => router.push(`/app/runs/${run.id}`) });
    } catch (e) {
      toast.error("Couldn't start", e instanceof Error ? e.message : undefined);
    }
  };

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
        <EmptyState icon={<Timer className="size-5" aria-hidden />} title="No scheduled searches" body="Add a ready-made one below, or set up your own." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
          {schedules.map((s) => {
            const last = s.lastRunId ? runs[s.lastRunId] : undefined;
            const workflow = workflows[s.workflowId];
            const when = s.trigger === "schedule" ? `${describeSchedule(s)}${s.condition.key === "always" ? "" : ` · only if ${CONDITION[s.condition.key] ?? s.condition.key.replace("_", " ")}`}` : "Runs when you start it";
            const lastLine = s.lastRunAt
              ? `Last run ${relativeTime(s.lastRunAt)}${last?.status === "FAILED" ? " · didn't finish" : last?.silent ? " · nothing to report" : last?.summary.strongMatches ? ` · ${last.summary.strongMatches} strong match${last.summary.strongMatches === 1 ? "" : "es"}` : ""}`
              : "Hasn't run yet";
            const expanded = open === s.id;
            const cad = cadenceId(s);
            return (
              <li key={s.id} className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1 text-[15px] font-semibold text-ink">
                      <span className="truncate">{s.name}</span>
                      <ChevronDown className={cn("size-4 shrink-0 text-ink-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                    </span>
                    <span className="block text-[13px] text-ink-2">{when}</span>
                    <span className={`block text-[12px] ${last?.status === "FAILED" ? "text-danger-600" : "text-ink-3"}`}>
                      {lastLine}
                      {s.enabled && s.nextRunAt ? ` · next ${relativeTime(s.nextRunAt)}` : !s.enabled ? " · paused" : ""}
                    </span>
                  </button>
                  <Switch checked={s.enabled} onChange={(v) => (!v || allowed(s, s.id)) && upsert({ ...s, enabled: v })} label={`${s.name} on`} />
                </div>
                {expanded && (
                  <div className="mt-3 grid gap-3 rounded-[12px] bg-surface-2 p-3 sm:grid-cols-2">
                    {s.trigger === "schedule" && (
                      <label className="text-[12px] text-ink-3">
                        How often
                        <Select
                          className="mt-1"
                          value={cad ?? ""}
                          onChange={(e) => {
                            const c = CADENCES.find((x) => x.id === e.target.value);
                            if (!c || (s.enabled && !allowed(c.cadence, s.id))) return;
                            upsert({ ...s, ...c.cadence, nextRunAt: nextScheduledRun({ ...c.cadence, timezone: s.timezone }) });
                          }}
                        >
                          {!cad && <option value="">{describeSchedule(s)}</option>}
                          {CADENCES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                    <label className="text-[12px] text-ink-3">
                      Tell me
                      <Select
                        className="mt-1"
                        value={s.condition.key === "always" ? "always" : "quiet"}
                        onChange={(e) => {
                          const quiet = e.target.value === "quiet";
                          upsert({ ...s, condition: quiet ? QUIET : ALWAYS });
                          if (workflow) upsertWorkflow({ ...workflow, version: workflow.version + 1, updatedAt: new Date().toISOString(), config: { ...workflow.config, notify: quiet ? "strong_matches_only" : "always" } });
                        }}
                      >
                        <option value="quiet">Only when there are strong matches</option>
                        <option value="always">Every time it runs</option>
                      </Select>
                    </label>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                      <Button size="sm" variant="outline" icon={<Play className="size-4" aria-hidden />} onClick={() => runNow(s)} disabled={!workflow}>
                        Run now
                      </Button>
                      <Link href={`/app/automation/scheduled/${s.id}`} className="text-[13px] font-medium text-brand-600 hover:underline">
                        Change what it searches
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-danger-600"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        onClick={() => {
                          remove(s.id);
                          setOpen(null);
                          // No confirm dialog: Undo brings it straight back, and its run history is kept either way.
                          toast.info("Search removed", "Its run history is kept.", { label: "Undo", onClick: () => upsert(s) });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Fold title="Ready-made searches" hint={profileQuery ? `Each searches “${profileQuery}” from your Career Profile` : "Add your target role to your Career Profile first"} open={schedules.length === 0} className="mt-6">
        <ul className="divide-y divide-line">
          {SEARCH_TEMPLATES.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{t.name}</span>
                <span className="block text-[12px] text-ink-3">{t.description}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => add(t) && toast.success(`${t.name} added`, describeSchedule({ ...t.cadence, timezone: "" }))}>
                Add
              </Button>
            </li>
          ))}
          {roles.length > 1 && (
            <li className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">A shortlist for each of your roles</span>
                <span className="block text-[12px] text-ink-3">{roles.map((r) => r.title).join(", ")} · weekdays at 8:00, only strong matches</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  let n = 0;
                  for (const r of roles) if (add(SEARCH_TEMPLATES[0], r)) n++;
                  else break;
                  if (n) toast.success(`${n} search${n === 1 ? "" : "es"} added`);
                }}
              >
                Add
              </Button>
            </li>
          )}
        </ul>
      </Fold>
    </section>
  );
}
