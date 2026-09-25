"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { AutomationLevel } from "@/domain/automation/policy";
import { AI_PROVIDERS, type AIProviderId } from "@/domain/ai/types";
import { getWorkflowService } from "@/services/workflow/service";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { deriveSearchIntent } from "@/services/jobs/searchIntent";
import { useCareerStore } from "@/store/career";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { useJobsStore } from "@/store/jobs";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Textarea } from "@/components/common/Input";
import { DictateButton } from "@/components/common/DictateButton";
import { useDictation } from "@/lib/dictation";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { ProviderSelector } from "@/components/ai/ProviderSelector";
import { ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";

// Phrasing examples only — they fill the box, they're never run or saved on their own.
const EXAMPLES = ["Product roles in AI startups", "Engineering leadership roles", "Remote roles in cybersecurity", "Director roles in fintech"];

type Origin = "your words" | "your Career Profile" | "you edited";

/**
 * Find (outcome spec §5): one plain-language box — "What are you looking for?" — and Wonder
 * derives the search from it. Every derived value is shown with where it came from before anything
 * runs; when no role can be read from the words or the Career Profile, the page asks rather than
 * substituting one. Sources, match threshold and AI provider stay available under "More options".
 */
function FindInner() {
  const router = useRouter();
  const params = useSearchParams();
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const aiConfig = useAIStore((s) => s.config);
  const sources = useJobsStore((s) => s.sources);
  const activeRun = useWorkflowStore(selectActiveRun);

  const [request, setRequest] = useState(() => params.get("q") ?? dna.careerGoal);
  const [level, setLevel] = useState<AutomationLevel>(defaultLevel);
  const [provider, setProvider] = useState<AIProviderId>(aiConfig.activeProvider);
  const [queryEdit, setQueryEdit] = useState<string | null>(null);
  const [locationsEdit, setLocationsEdit] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>(sources.filter((s) => s.enabled).map((s) => s.id));
  const [threshold, setThreshold] = useState(70);
  const [more, setMore] = useState(false);
  const [saveAsGoal, setSaveAsGoal] = useState(() => !dna.careerGoal.trim());
  const [error, setError] = useState<string | null>(null);

  const intent = useMemo(() => deriveSearchIntent(request), [request]);
  const profileQuery = useMemo(() => defaultSearchQuery(dna), [dna]);
  const query: { value: string; origin: Origin } = queryEdit != null ? { value: queryEdit.trim(), origin: "you edited" } : intent.query ? { value: intent.query, origin: "your words" } : { value: profileQuery, origin: "your Career Profile" };
  const locations: { value: string[]; origin: Origin } =
    locationsEdit != null
      ? { value: locationsEdit.split(",").map((s) => s.trim()).filter(Boolean), origin: "you edited" }
      : intent.locations.length
        ? { value: intent.locations, origin: "your words" }
        : { value: dna.preferredLocations, origin: "your Career Profile" };
  const workModes = intent.workModes.length ? intent.workModes : dna.workModes;
  const goalChanged = request.trim() !== dna.careerGoal.trim();
  const model = useMemo(() => (provider === aiConfig.activeProvider ? aiConfig.activeModel : AI_PROVIDERS[provider].models.find((m) => m.default)?.id ?? AI_PROVIDERS[provider].models[0].id), [provider, aiConfig]);

  const dictation = useDictation({ textAtStart: () => request, onText: setRequest });

  const blocker = activeRun ? null : !request.trim() ? "Tell Wonder what you're looking for." : !query.value ? "Wonder couldn't tell which roles to search for — name a role (e.g. “product manager”), or set it under More options." : sourceIds.length === 0 ? "Pick at least one source under More options." : null;

  const start = () => {
    setError(null);
    try {
      // Only saved to the Career Profile when the candidate ticked it — never silently.
      if (saveAsGoal && goalChanged) updateDNA({ careerGoal: request.trim() });
      const run = getWorkflowService().startRun({
        workflowName: `Search — ${request.trim().replace(/^(find|search for)\s+/i, "").slice(0, 48)}`,
        config: {
          careerGoal: request.trim(),
          automationLevel: level,
          provider: { provider, model, billing: AI_PROVIDERS[provider].billing },
          sourceIds,
          searchCriteria: { query: query.value, locations: locations.value, workModes, minSalary: dna.minSalary },
          minMatchThreshold: threshold,
          maxResults: 50,
          notify: "strong_matches_only",
        },
      });
      track("find_started", { level, sources: sourceIds.length, locations: locations.value.length, derivedFromWords: query.origin === "your words" });
      toast.success("Wonder is finding opportunities", "You can pause or stop at any time.");
      router.push(`/app/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the search.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/app", label: "Home" }} title="Find opportunities with Wonder" description="Tell Wonder what you're looking for in your own words. Wonder handles the rest." />
      {activeRun && (
        <ErrorState
          className="mb-5"
          title="Wonder is already working on a search"
          body={`“${activeRun.workflowName.replace(/^(Search|Job Search) — /, "")}” is still going. Stop it or wait for it to finish before starting another.`}
          actions={[{ label: "See progress", href: `/app/runs/${activeRun.id}`, variant: "primary" }]}
        />
      )}
      <div className="flex flex-col gap-4 pb-44 md:pb-0">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="find-request" className="text-[15px] font-semibold text-ink">
              What are you looking for?
            </label>
            {dictation.supported && <DictateButton listening={dictation.listening} onClick={dictation.toggle} label="what you're looking for" />}
          </div>
          <div className="relative mt-2">
            <Textarea
              id="find-request"
              value={request}
              onChange={(e) => {
                setRequest(e.target.value);
                if (dictation.listening) dictation.rebase(e.target.value);
              }}
              className="min-h-24 pr-12"
              placeholder="e.g. Senior Director or VP roles in IAM and Identity Security in Mumbai, Singapore or remote, preferably fintech"
            />
            <button type="button" onClick={start} disabled={!!activeRun || !!blocker} aria-label="Find opportunities" className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-[10px] bg-brand-500 text-white transition-opacity disabled:opacity-40">
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
          {dictation.listening && <p aria-live="polite" className="mt-1.5 text-[12px] text-ink-3">{dictation.interim ? `Hearing: ${dictation.interim}` : "Listening — describe the roles you want."}</p>}
          {dictation.error && (
            <p role="alert" className="mt-1 text-[12px] text-danger-600">
              {dictation.error}
            </p>
          )}

          <p className="mt-4 text-[12px] font-medium text-ink-3">Try an example</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Chip key={ex} onClick={() => setRequest(ex)}>
                {ex}
              </Chip>
            ))}
          </div>

          {request.trim() && (
            <div className="mt-5 rounded-[14px] bg-surface-2 p-3.5" aria-live="polite">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                <Sparkles className="size-3.5" aria-hidden /> Wonder will search for
              </p>
              <dl className="mt-2 grid gap-1.5 text-[13px]">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-3">Roles</dt>
                  <dd className="font-medium text-ink">{query.value ? `“${query.value}”` : "— not clear yet"}</dd>
                  {query.value && <dd className="text-ink-4">from {query.origin}</dd>}
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-3">Where</dt>
                  <dd className="font-medium text-ink">{locations.value.length ? locations.value.join(", ") : "Anywhere"}</dd>
                  {locations.value.length > 0 && <dd className="text-ink-4">from {locations.origin}</dd>}
                </div>
                {intent.industries.length > 0 && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-ink-3">Industry preference</dt>
                    <dd className="font-medium text-ink">{intent.industries.join(", ")}</dd>
                    <dd className="text-ink-4">weighed in each match, not a filter</dd>
                  </div>
                )}
              </dl>
              {goalChanged && (
                <label className="mt-3 flex items-start gap-2 text-[12px] text-ink-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand-600)]" checked={saveAsGoal} onChange={(e) => setSaveAsGoal(e.target.checked)} />
                  <span>Also save this as my career goal in my Career Profile</span>
                </label>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">How much should Wonder handle?</h2>
            <Link href="/app/automation/settings" className="text-[12px] font-medium text-brand-600 hover:underline">
              What Wonder can do
            </Link>
          </div>
          <AutomationLevelSelector value={level} onChange={setLevel} layout="grid" />
        </Card>

        <Card>
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center justify-between text-left">
            <h2 className="text-[15px] font-semibold text-ink">More options</h2>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600">
              {more ? "Hide" : "Show"}
              {more ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            </span>
          </button>
          {!more && (
            <p className="mt-1 text-[13px] text-ink-3">
              {sourceIds.length} of {sources.length} sources · minimum match {threshold} · {AI_PROVIDERS[provider].name}
            </p>
          )}
          {more && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Search terms" htmlFor="q" hint="What the job boards are asked for. Edit to override what Wonder read from your words.">
                <Input id="q" value={queryEdit ?? query.value} onChange={(e) => setQueryEdit(e.target.value)} placeholder="e.g. engineering director" />
              </Field>
              <Field label="Locations" htmlFor="loc" hint="Comma-separated">
                <Input id="loc" value={locationsEdit ?? locations.value.join(", ")} onChange={(e) => setLocationsEdit(e.target.value)} />
              </Field>
              <Field label={`Minimum match: ${threshold}`} htmlFor="thr" className="sm:col-span-2" hint="How closely a role must fit your Career Profile (0–100) to make the shortlist. 70 is a good start.">
                <input id="thr" type="range" min={50} max={95} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-brand-500" />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium text-ink-2">Sources</p>
                <p className="mb-2 text-[12px] text-ink-3">Live public job feeds and company career pages.</p>
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
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium text-ink-2">AI provider</p>
                <ProviderSelector config={aiConfig} value={provider} onChange={setProvider} />
              </div>
            </div>
          )}
        </Card>

        {error && <ErrorState title="Couldn't start the search" body={error} />}
      </div>
      {/* Fixed (not sticky) so it never paints over the cards above; `pb-44` reserves its space on mobile. */}
      <div className="fixed inset-x-0 bottom-[var(--wj-mobile-nav-h)] z-10 bg-bg px-4 pb-4 pt-3 md:static md:mt-4 md:bg-transparent md:p-0">
        <Button size="xl" full onClick={start} disabled={!!activeRun || !!blocker}>
          Find opportunities
        </Button>
        {blocker && <p className="mt-2 text-center text-[12px] text-ink-3">{blocker}</p>}
      </div>
    </div>
  );
}

export default function FindPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FindInner />
    </Suspense>
  );
}
