"use client";
/**
 * WorkflowService — the mock backend for runs. Owns one WorkflowEngine per
 * browser session, mirrors engine state into the workflow store (immutable
 * snapshots) and wires notifications/activity/analytics to run events.
 */
import { WorkflowEngine } from "@/domain/workflow/engine";
import { STAGE_KEYS, STAGES, type StageKey } from "@/domain/workflow/stages";
import { isActive } from "@/domain/workflow/status";
import type { RunConfig, WorkflowRun } from "@/domain/workflow/types";
import { FallbackProvider, TemplateAIService, WonderJobsAIProvider, type AIService } from "@/services/ai/service";
import { RemoteBYOKProvider } from "@/services/ai/client";
import { createExecutors, inheritCaches, seedCachesFromCatalog } from "./executors";
import { useAutomationStore } from "@/store/automation";
import { useWorkflowStore } from "@/store/workflow";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { track } from "@/lib/analytics";
import type { AIUsageRecord } from "@/domain/ai/types";
import { newId } from "@/lib/ids";

export interface StartRunInput {
  workflowId?: string;
  workflowName: string;
  config: RunConfig;
  trigger?: "manual" | "schedule";
  stageKeys?: StageKey[];
}

class WorkflowService {
  private engine: WorkflowEngine;
  private hydrated = false;

  constructor() {
    this.engine = new WorkflowEngine({
      executors: createExecutors({ ai: (runId) => this.aiFor(runId) }),
      getPolicy: () => useAutomationStore.getState().policy,
      onChange: (run) => useWorkflowStore.getState().upsertRun(structuredClone(run)),
      onEvent: (run, e) => {
        const career = useCareerStore.getState();
        switch (e.type) {
          case "run_started":
            track("run_started", { runId: run.id, level: run.config.automationLevel, provider: run.config.provider.provider });
            break;
          case "run_paused":
            track("run_paused", { runId: run.id });
            break;
          case "run_resumed":
            track("run_resumed", { runId: run.id });
            break;
          case "run_stopped":
            track("run_stopped", { runId: run.id });
            break;
          case "stage_completed":
            track("workflow_stage_completed", { runId: run.id, stage: e.stageKey });
            break;
          case "stage_waiting":
            track("workflow_waiting_for_user", { runId: run.id, stage: e.stageKey });
            career.notify({ category: "workflow_requires_input", title: "Wonder needs your input", body: e.message, href: `/app/runs/${run.id}` });
            break;
          case "run_completed": {
            if (run.trigger === "schedule") track("scheduled_run_completed", { runId: run.id, silent: !!run.silent });
            const strong = run.summary.strongMatches;
            career.addActivity({ kind: "run_completed", title: "Job search completed", subtitle: strong ? `${strong} strong match${strong === 1 ? "" : "es"}` : "No new strong matches", href: `/app/runs/${run.id}` });
            // Silence is a valid outcome: only notify when there is something worth attention.
            if (!run.silent && (run.config.notify === "always" || (run.config.notify === "strong_matches_only" && strong > 0))) {
              career.notify({ category: strong ? "strong_opportunity" : "workflow_completed", title: strong ? `${strong} new strong match${strong === 1 ? "" : "es"}` : "Run finished", body: strong ? "Wonder found roles that fit your Career DNA." : "Nothing new worth your attention this time.", href: strong ? "/app/jobs?fit=strong" : `/app/runs/${run.id}` });
            }
            break;
          }
          case "run_failed":
            career.notify({ category: run.error?.source && run.error.source !== "wonderjobs" ? "provider_issue" : "scheduled_run_failed", title: "Run needs attention", body: e.message, href: `/app/runs/${run.id}` });
            break;
        }
      },
    });
  }

  /** Restore persisted runs into the engine once the store has rehydrated. */
  hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    const runs = Object.values(useWorkflowStore.getState().runs);
    this.engine.hydrate(structuredClone(runs));
    for (const run of this.engine.listRuns()) useWorkflowStore.getState().upsertRun(structuredClone(run));
  }

  private aiFor(runId: string): AIService {
    const run = this.engine.getRun(runId);
    const snapshot = run?.config.provider ?? { provider: "wonderjobs", model: "wonder-1", billing: "platform" as const };
    const record = (r: AIUsageRecord) => useAIStore.getState().recordUsage(r);
    if (snapshot.provider === "wonderjobs") return new TemplateAIService(new WonderJobsAIProvider(), record, null);
    const cost = { anthropic: { input: 5, output: 25 }, openai: { input: 2.5, output: 10 }, gemini: { input: 1.25, output: 10 } }[snapshot.provider];
    const primary = new RemoteBYOKProvider(snapshot.provider, snapshot.model ?? "");
    const provider = new FallbackProvider(primary, new WonderJobsAIProvider(), () => useAIStore.getState().config.allowPlatformFallback, (reason) =>
      useCareerStore.getState().notify({ category: "provider_issue", title: `Switched to WonderJobs AI for one request`, body: `${reason} You allowed automatic fallback in AI settings.`, href: "/app/settings/ai" }),
    );
    return new TemplateAIService(provider, record, cost);
  }

  hasActiveRun() {
    return Object.values(useWorkflowStore.getState().runs).some((r) => isActive(r.status));
  }

  startRun(input: StartRunInput): WorkflowRun {
    this.hydrate();
    if (this.hasActiveRun()) throw new Error("A run is already active. Stop it before starting another.");
    const run = this.engine.createRun({
      workflowId: input.workflowId ?? newId("wf"),
      workflowName: input.workflowName,
      workflowVersion: 1,
      trigger: input.trigger ?? "manual",
      config: input.config,
      stageKeys: input.stageKeys ?? [...STAGE_KEYS],
      inputs: [
        { key: "careerGoal", label: "Career goal", value: input.config.careerGoal, provenance: "USER_PROVIDED", updatedAt: new Date().toISOString() },
        { key: "minMatchThreshold", label: "Minimum match", value: input.config.minMatchThreshold, provenance: "USER_PROVIDED", updatedAt: new Date().toISOString() },
      ],
    });
    void this.engine.start(run.id);
    return run;
  }

  pause(id: string) {
    this.engine.pause(id);
  }
  resume(id: string) {
    this.engine.resume(id);
  }
  stop(id: string) {
    this.engine.stop(id);
  }
  cancel(id: string) {
    this.engine.cancel(id);
  }
  continue(id: string) {
    this.engine.continueFromUser(id);
  }
  restartStage(id: string) {
    this.engine.restartStage(id);
  }
  rerunFrom(id: string, stage: StageKey): WorkflowRun {
    this.hydrate();
    if (this.hasActiveRun()) throw new Error("A run is already active. Stop it before starting another.");
    if (!this.engine.getRun(id)) throw new Error("This run is no longer available.");
    const child = this.engine.rerunFrom(id, stage);
    inheritCaches(id, child.id);
    seedCachesFromCatalogIfNeeded(id, child.id, stage);
    void this.engine.start(child.id);
    return child;
  }
  override(id: string, input: { stageKey: StageKey; key: string; label: string; value: unknown }) {
    return this.engine.applyOverride(id, input);
  }
  removeOverride(id: string, overrideId: string) {
    this.engine.removeOverride(id, overrideId);
  }
  confirmAction(id: string, actionId: string) {
    this.engine.confirmAction(id, actionId);
  }
  rejectAction(id: string, actionId: string) {
    this.engine.rejectAction(id, actionId);
  }
  stageName(key: StageKey) {
    return STAGES[key].name;
  }
}

function seedCachesFromCatalogIfNeeded(parentId: string, childId: string, stage: StageKey) {
  // After a reload the parent's in-memory caches are gone; rebuild working memory
  // from the catalog when rerunning from a stage that depends on prior results.
  if (stage !== "profile" && stage !== "search") {
    seedCachesFromCatalog(childId);
    inheritCaches(parentId, childId); // parent caches (if any) win
  }
}

let instance: WorkflowService | null = null;
export function getWorkflowService() {
  if (!instance) instance = new WorkflowService();
  return instance;
}
