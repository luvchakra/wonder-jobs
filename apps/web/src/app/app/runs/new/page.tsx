"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Info, ChevronDown, ChevronUp } from "lucide-react";
import type { AutomationLevel } from "@/domain/automation/policy";
import { AI_PROVIDERS, type AIProviderId } from "@/domain/ai/types";
import { getWorkflowService } from "@/services/workflow/service";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { useCareerStore } from "@/store/career";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { useJobsStore } from "@/store/jobs";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Textarea } from "@/components/common/Input";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { ProviderSelector } from "@/components/ai/ProviderSelector";
import { ErrorState } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import Link from "next/link";

export default function RunSetupPage() {
  const router = useRouter();
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const aiConfig = useAIStore((s) => s.config);
  const sources = useJobsStore((s) => s.sources);
  const activeRun = useWorkflowStore(selectActiveRun);

  const [goal, setGoal] = useState(dna.careerGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [level, setLevel] = useState<AutomationLevel>(defaultLevel);
  const [provider, setProvider] = useState<AIProviderId>(aiConfig.activeProvider);
  // Never a canned role: the boards are asked for this candidate's own headline/goal, or nothing until they type one.
  const [query, setQuery] = useState(() => defaultSearchQuery(dna));
  const [locations, setLocations] = useState(dna.preferredLocations.join(", "));
  const [sourceIds, setSourceIds] = useState<string[]>(sources.filter((s) => s.enabled).map((s) => s.id));
  const [threshold, setThreshold] = useState(70);
  const [advanced, setAdvanced] = useState(() => !defaultSearchQuery(dna));
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(() => (provider === aiConfig.activeProvider ? aiConfig.activeModel : AI_PROVIDERS[provider].models.find((m) => m.default)?.id ?? AI_PROVIDERS[provider].models[0].id), [provider, aiConfig]);

  const start = () => {
    setError(null);
    try {
      if (goal.trim() !== dna.careerGoal) updateDNA({ careerGoal: goal.trim() });
      const run = getWorkflowService().startRun({
        workflowName: `Job Search — ${goal.trim().replace(/^find /i, "").slice(0, 40)}`,
        config: {
          careerGoal: goal.trim(),
          automationLevel: level,
          provider: { provider, model, billing: AI_PROVIDERS[provider].billing },
          sourceIds,
          searchCriteria: { query: query.trim(), locations: locations.split(",").map((s) => s.trim()).filter(Boolean), workModes: dna.workModes, minSalary: dna.minSalary },
          minMatchThreshold: threshold,
          maxResults: 50,
          notify: "strong_matches_only",
        },
      });
      toast.success("Wonder is on it", "You can pause, stop or step in at any time.");
      router.push(`/app/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/app", label: "Home" }} title="Run Wonder" description="Tell us what you're looking for. Wonder will take care of the rest." />
      {activeRun && (
        <ErrorState
          className="mb-5"
          title="A run is already active"
          body={`“${activeRun.workflowName}” is ${activeRun.status.toLowerCase().replace(/_/g, " ")}. Stop it or wait for it to finish before starting another.`}
          actions={[{ label: "Open active run", href: `/app/runs/${activeRun.id}`, variant: "primary" }]}
        />
      )}
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-ink">
                Career Goal <span className="text-danger-600">*</span>
              </h2>
              {editingGoal ? (
                <Textarea autoFocus value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => setEditingGoal(false)} className="mt-2 min-h-20" aria-label="Career goal" />
              ) : (
                <p className="mt-1 text-[14px] text-ink-2">{goal || "Describe the roles you want."}</p>
              )}
            </div>
            <button type="button" onClick={() => setEditingGoal((v) => !v)} aria-label="Edit career goal" className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink">
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Automation Level</h2>
            <Link href="/app/automation/settings" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline">
              <Info className="size-3.5" aria-hidden /> What&apos;s this?
            </Link>
          </div>
          <AutomationLevelSelector value={level} onChange={setLevel} />
          <p className="mt-3 text-[12px] text-ink-3">Whatever you choose, high-risk actions like submitting an application always follow your Automation Settings.</p>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">AI Provider</h2>
            <Link href="/app/settings/ai" className="text-[12px] font-medium text-brand-600 hover:underline">
              Learn more
            </Link>
          </div>
          <ProviderSelector config={aiConfig} value={provider} onChange={setProvider} />
        </Card>

        <Card>
          <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex w-full items-center justify-between text-left">
            <h2 className="text-[15px] font-semibold text-ink">Search details</h2>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600">
              {advanced ? "Hide" : "Edit"}
              {advanced ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            </span>
          </button>
          {!advanced && (
            <p className="mt-1 text-[13px] text-ink-3">
              “{query}” in {locations || "any location"} · {sourceIds.length} of {sources.length} sources · min match {threshold}
            </p>
          )}
          {advanced && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Search query" htmlFor="q" required hint={query.trim() ? "What the job boards are asked for — suggested from your Career DNA, edit freely." : "What the job boards are asked for, e.g. “engineering director” or “product manager”. Add a headline to your Career DNA and Wonder will suggest this next time."}>
                <Input id="q" value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="e.g. engineering director" />
              </Field>
              <Field label="Locations" htmlFor="loc" hint="Comma-separated">
                <Input id="loc" value={locations} onChange={(e) => setLocations(e.target.value)} />
              </Field>
              <Field label={`Minimum match score: ${threshold}`} htmlFor="thr" className="sm:col-span-2" hint="How closely a role must match your Career DNA (0–100) to be worth showing. 70 is a good starting point.">
                <input id="thr" type="range" min={50} max={95} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-brand-500" />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium text-ink-2">Sources</p>
                <p className="mb-2 text-[12px] text-ink-3">Live public job feeds and company career pages. Wonder reads each posting and scores it against your Career DNA.</p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => {
                    const blocked = s.requiresSetup && s.available === false;
                    return (
                      <Chip key={s.id} active={sourceIds.includes(s.id) && !blocked} onClick={() => !blocked && setSourceIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))} className={blocked ? "opacity-50" : ""}>
                        {s.name}
                        {blocked ? " · needs setup" : ""}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {error && <ErrorState title="Couldn't start the run" body={error} />}
        <div className="sticky bottom-20 z-10 md:static">
          <Button size="xl" full onClick={start} disabled={!!activeRun || !goal.trim() || !query.trim() || sourceIds.length === 0}>
            Continue
          </Button>
          {!activeRun && !goal.trim() && <p className="mt-2 text-center text-[12px] text-ink-3">Add a career goal to continue.</p>}
          {!activeRun && goal.trim() && !query.trim() && <p className="mt-2 text-center text-[12px] text-ink-3">Add a search query under Search details to continue.</p>}
          {!activeRun && goal.trim() && query.trim() && sourceIds.length === 0 && <p className="mt-2 text-center text-[12px] text-ink-3">Pick at least one source under Search details to continue.</p>}
        </div>
      </div>
    </div>
  );
}
