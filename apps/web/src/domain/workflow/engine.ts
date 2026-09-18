/**
 * WorkflowEngine — executes a WorkflowRun stage by stage against pluggable
 * stage executors, enforcing the state machine, automation policy, graceful
 * stop, pause/resume, user intervention, overrides with provenance, rerun from
 * stage and idempotent external actions.
 *
 * The engine is pure TypeScript with no React/DOM dependency so the same code
 * can run in a browser (mock backend), a worker, or a server process.
 */
import { newId } from "@/lib/ids";
import { resolveCapability, type AutomationPolicy, type Capability } from "@/domain/automation/policy";
import { assertTransition, isTerminal, type RunStatus } from "./status";
import { STAGES, STAGE_KEYS, STAGE_ORDER, type StageKey } from "./stages";
import { resolveRunValue } from "./resolve";
import type {
  Evidence,
  Provenance,
  RunConfig,
  RunError,
  RunEvent,
  RunSummary,
  WorkflowAction,
  WorkflowInput,
  WorkflowOverride,
  WorkflowRun,
  WorkflowStageRun,
} from "./types";

export class StopSignal extends Error {
  constructor() {
    super("stop");
    this.name = "StopSignal";
  }
}
export class RestartSignal extends Error {
  constructor() {
    super("restart");
    this.name = "RestartSignal";
  }
}
export class StageFailure extends Error {
  constructor(public readonly error: RunError) {
    super(error.message);
    this.name = "StageFailure";
  }
}

export interface StageResult {
  data: Record<string, unknown>;
  counts?: Record<string, number>;
  warnings?: string[];
  provenance?: Provenance;
}

export interface StageContext {
  readonly run: Readonly<WorkflowRun>;
  readonly stage: Readonly<WorkflowStageRun>;
  /** Resolved value: user overrides win over stage outputs, which win over run inputs. */
  get<T = unknown>(key: string): T | undefined;
  output<T = Record<string, unknown>>(stageKey: StageKey): T | undefined;
  setProgress(current: number, total?: number | null): void;
  setCounts(counts: Record<string, number>): void;
  addEvidence(evidence: Evidence): void;
  warn(message: string): void;
  /** Cooperative cancellation point: awaits while paused, throws StopSignal/RestartSignal. */
  checkpoint(): Promise<void>;
  policy(capability: Capability): "run" | "ask" | "skip";
  /** Park the stage in WAITING_FOR_USER until the user continues (or stops). */
  requestUser(reason: string): Promise<void>;
  /** Register an external action; returns the ledger entry (may already be executed). */
  registerAction(input: { type: WorkflowAction["type"]; idempotencyKey: string; targetId: string; label: string }): WorkflowAction;
  /** Executes a confirmed action exactly once, recording history. */
  executeAction(actionId: string, fn: () => Promise<void>): Promise<WorkflowAction>;
  sleep(ms: number): Promise<void>;
  fail(error: RunError): never;
}

export type StageExecutor = (ctx: StageContext) => Promise<StageResult>;

export interface EngineOptions {
  executors: Partial<Record<StageKey, StageExecutor>>;
  getPolicy: () => AutomationPolicy;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Called after every state change with the run (mutated in place). */
  onChange?: (run: WorkflowRun, changed: "run" | "stage" | "progress") => void;
  /** Called for every run event — hook for analytics/notifications. */
  onEvent?: (run: WorkflowRun, event: RunEvent) => void;
  /** Pre-existing external actions (shared idempotency ledger across runs). */
  ledger?: WorkflowAction[];
}

export interface CreateRunInput {
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  trigger: "manual" | "schedule";
  config: RunConfig;
  inputs?: WorkflowInput[];
  stageKeys?: StageKey[];
}

interface RunControl {
  pauseGate?: { promise: Promise<void>; resolve: () => void };
  userGate?: { promise: Promise<void>; resolve: () => void };
  /** Set when a restored run is continued: the next user gate is already answered. */
  userGateSatisfied?: boolean;
  restartRequested: boolean;
  stopRequested: boolean;
  loop?: Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class WorkflowEngine {
  private runs = new Map<string, WorkflowRun>();
  private controls = new Map<string, RunControl>();
  private ledger = new Map<string, WorkflowAction>();
  private readonly now: () => string;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(private readonly opts: EngineOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.sleepFn = opts.sleep ?? defaultSleep;
    for (const a of opts.ledger ?? []) this.ledger.set(a.idempotencyKey, a);
  }

  // ---------------------------------------------------------------- queries
  getRun(id: string) {
    return this.runs.get(id);
  }
  listRuns() {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  listActions() {
    return [...this.ledger.values()];
  }
  /** Hydrate runs restored from persistence. Active runs are marked STOPPED (the process died). */
  hydrate(runs: WorkflowRun[]) {
    for (const run of runs) {
      if (!isTerminal(run.status) && run.status !== "PENDING" && run.status !== "WAITING_FOR_USER") {
        // Persisted state is preserved; the process that executed it is gone. A run that was waiting for the
        // candidate keeps waiting: closing the tab is not a decision, and `continueFromUser` restores it.
        run.status = "STOPPED";
        for (const s of run.stages) if (s.status === "RUNNING" || s.status === "PAUSED" || s.status === "STOPPING" || s.status === "WAITING_FOR_USER") s.status = "STOPPED";
        run.events.push(this.event("run_stopped", "Run was interrupted and restored as stopped. Completed stages are preserved — rerun from any stage to continue."));
      }
      this.runs.set(run.id, run);
      for (const a of run.actions) if (a.status === "succeeded") this.ledger.set(a.idempotencyKey, a);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  createRun(input: CreateRunInput): WorkflowRun {
    const id = newId("run");
    const at = this.now();
    const stageKeys = input.stageKeys ?? [...STAGE_KEYS];
    const run: WorkflowRun = {
      id,
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      workflowVersion: input.workflowVersion,
      trigger: input.trigger,
      status: "PENDING",
      config: structuredClone(input.config),
      inputs: input.inputs ? structuredClone(input.inputs) : [],
      overrides: [],
      stages: stageKeys.map((key) => this.newStage(id, key)),
      outputs: {},
      actions: [],
      events: [],
      createdAt: at,
      summary: emptySummary(),
    };
    run.events.push(this.event("run_created", `Run created for “${run.workflowName}”.`));
    this.runs.set(id, run);
    this.controls.set(id, { restartRequested: false, stopRequested: false });
    this.changed(run, "run");
    return run;
  }

  /** Starts the run loop. Resolves when the run reaches a terminal state. */
  start(runId: string): Promise<void> {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    if (ctl.loop) return ctl.loop;
    this.transition(run, "RUNNING");
    run.startedAt = this.now();
    this.push(run, "run_started", "Wonder started working.");
    ctl.loop = this.loop(run, ctl).finally(() => {
      ctl.loop = undefined;
    });
    return ctl.loop;
  }

  pause(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    this.transition(run, "PAUSED");
    const stage = this.currentStage(run);
    if (stage && stage.status === "RUNNING") this.transitionStage(stage, "PAUSED", run);
    if (!ctl.pauseGate) {
      let resolve = () => {};
      const promise = new Promise<void>((r) => (resolve = r));
      ctl.pauseGate = { promise, resolve };
    }
    this.push(run, "run_paused", "Paused. Nothing new will start until you resume.");
  }

  resume(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    if (run.status !== "PAUSED") throw new Error("Run is not paused");
    this.transition(run, "RUNNING");
    const stage = this.currentStage(run);
    if (stage && stage.status === "PAUSED") this.transitionStage(stage, "RUNNING", run);
    ctl.pauseGate?.resolve();
    ctl.pauseGate = undefined;
    this.push(run, "run_resumed", "Resumed.");
  }

  /** Graceful stop (spec §9): STOPPING → let the current unit finish → persist → STOPPED. */
  stop(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    if (run.status === "PENDING") return this.cancel(runId);
    this.transition(run, "STOPPING");
    const stage = this.currentStage(run);
    if (stage && !isTerminal(stage.status) && stage.status !== "PENDING") this.transitionStage(stage, "STOPPING", run);
    ctl.stopRequested = true;
    this.push(run, "run_stopping", "Stopping — finishing the current step safely. Completed work is preserved.");
    // release any gates so the loop can observe the stop request
    ctl.pauseGate?.resolve();
    ctl.pauseGate = undefined;
    ctl.userGate?.resolve();
    ctl.userGate = undefined;
    if (!ctl.loop) this.finishStopped(run, ctl);
  }

  cancel(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    this.transition(run, "CANCELLED");
    for (const s of run.stages) if (s.status === "PENDING" || s.status === "WAITING_FOR_USER") s.status = "CANCELLED";
    run.completedAt = this.now();
    this.push(run, "run_cancelled", "Run cancelled before it started.");
    ctl.userGate?.resolve();
    ctl.userGate = undefined;
  }

  /** User reviewed / approved: release a WAITING_FOR_USER stage. */
  continueFromUser(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    if (run.status !== "WAITING_FOR_USER") throw new Error("Run is not waiting for you");
    if (!ctl.loop) {
      // Restored from persistence: no executor is parked on the gate. Re-run the waiting stage with its wait
      // already answered; completed stages are skipped and outputs are intact.
      const stage = this.currentStage(run);
      if (stage && stage.status === "WAITING_FOR_USER") {
        stage.status = "PENDING";
        stage.waitingReason = undefined;
      }
      ctl.userGateSatisfied = true;
      this.transition(run, "RUNNING");
      this.push(run, "run_resumed", "Thanks — continuing.");
      ctl.loop = this.loop(run, ctl).finally(() => {
        ctl.loop = undefined;
      });
      return;
    }
    this.transition(run, "RUNNING");
    const stage = this.currentStage(run);
    if (stage && stage.status === "WAITING_FOR_USER") {
      this.transitionStage(stage, "RUNNING", run);
      stage.waitingReason = undefined;
    }
    this.push(run, "run_resumed", "Thanks — continuing.");
    ctl.userGate?.resolve();
    ctl.userGate = undefined;
  }

  /** Restart the current stage (spec §9). Works while running, paused or waiting. */
  restartStage(runId: string) {
    const run = this.mustGet(runId);
    const ctl = this.control(runId);
    if (isTerminal(run.status) || run.status === "PENDING") throw new Error("Run is not active");
    ctl.restartRequested = true;
    const stage = this.currentStage(run);
    this.push(run, "stage_restarted", `Restarting “${stage ? STAGES[stage.key].name : "stage"}”.`, stage?.key);
    if (run.status === "PAUSED") this.resume(runId);
    else if (run.status === "WAITING_FOR_USER") this.continueFromUser(runId);
  }

  /**
   * Rerun from a stage (spec §21). Creates a NEW run that inherits inputs,
   * config, provider snapshot, overrides and all outputs before `fromStage`.
   * External actions are never re-executed: the idempotency ledger is shared.
   */
  rerunFrom(runId: string, fromStage: StageKey): WorkflowRun {
    const parent = this.mustGet(runId);
    const child = this.createRun({
      workflowId: parent.workflowId,
      workflowName: parent.workflowName,
      workflowVersion: parent.workflowVersion,
      trigger: "manual",
      config: parent.config,
      inputs: parent.inputs,
      stageKeys: parent.stages.map((s) => s.key),
    });
    child.parentRunId = parent.id;
    child.rerunFromStage = fromStage;
    child.overrides = structuredClone(parent.overrides);
    const fromIdx = STAGE_ORDER[fromStage];
    for (const stage of child.stages) {
      if (STAGE_ORDER[stage.key] >= fromIdx) continue;
      const src = parent.stages.find((s) => s.key === stage.key);
      const out = parent.outputs[stage.key];
      if (src && (src.status === "COMPLETED" || src.status === "COMPLETED_WITH_WARNINGS") && out) {
        Object.assign(stage, structuredClone({ ...src, id: stage.id, runId: child.id, inheritedFromRunId: parent.id }));
        child.outputs[stage.key] = { ...structuredClone(out), inheritedFromRunId: parent.id };
      }
    }
    child.events.push(this.event("run_created", `Rerun from “${STAGES[fromStage].name}” (based on ${parent.id}).`, fromStage));
    this.recomputeSummary(child);
    this.changed(child, "run");
    return child;
  }

  // ---------------------------------------------------------------- intervention
  applyOverride(runId: string, input: { stageKey: StageKey; key: string; label: string; value: unknown }): WorkflowOverride {
    const run = this.mustGet(runId);
    const previous = this.resolveValue(run, input.key);
    const existing = run.inputs.find((i) => i.key === input.key) || run.overrides.find((o) => o.key === input.key);
    const override: WorkflowOverride = {
      id: newId("ovr"),
      stageKey: input.stageKey,
      key: input.key,
      label: input.label,
      value: structuredClone(input.value),
      previousValue: previous === undefined ? undefined : structuredClone(previous),
      provenance: existing || previous !== undefined ? "USER_MODIFIED" : "USER_PROVIDED",
      createdAt: this.now(),
    };
    run.overrides = run.overrides.filter((o) => o.key !== input.key);
    run.overrides.push(override);
    this.push(run, "override_applied", `${input.label} set by you.`, input.stageKey);
    return override;
  }

  removeOverride(runId: string, overrideId: string) {
    const run = this.mustGet(runId);
    const o = run.overrides.find((x) => x.id === overrideId);
    run.overrides = run.overrides.filter((x) => x.id !== overrideId);
    if (o) this.push(run, "override_applied", `${o.label} reverted to the AI value.`, o.stageKey);
  }

  confirmAction(runId: string, actionId: string) {
    const run = this.mustGet(runId);
    const a = run.actions.find((x) => x.id === actionId);
    if (!a) throw new Error("Unknown action");
    if (a.status !== "pending_confirmation") return a;
    a.status = "confirmed";
    a.history.push({ at: this.now(), event: "confirmed", detail: "Confirmed by you" });
    this.push(run, "action_confirmed", `Approved: ${a.label}`, a.stageKey);
    return a;
  }

  rejectAction(runId: string, actionId: string) {
    const run = this.mustGet(runId);
    const a = run.actions.find((x) => x.id === actionId);
    if (!a) throw new Error("Unknown action");
    if (a.status !== "pending_confirmation") return a;
    a.status = "rejected";
    a.history.push({ at: this.now(), event: "rejected", detail: "Declined by you" });
    this.push(run, "action_rejected", `Declined: ${a.label}`, a.stageKey);
    return a;
  }

  // ---------------------------------------------------------------- loop
  private async loop(run: WorkflowRun, ctl: RunControl) {
    try {
      for (const stage of run.stages) {
        if (stage.status === "COMPLETED" || stage.status === "COMPLETED_WITH_WARNINGS") continue; // inherited
        if (ctl.stopRequested) throw new StopSignal();
        run.currentStage = stage.key;
        await this.executeStage(run, stage, ctl);
        if (run.status === "STOPPING") throw new StopSignal();
      }
      run.currentStage = undefined;
      const warnings = run.stages.some((s) => s.warnings.length > 0 || s.status === "COMPLETED_WITH_WARNINGS");
      this.transition(run, warnings ? "COMPLETED_WITH_WARNINGS" : "COMPLETED");
      run.completedAt = this.now();
      this.recomputeSummary(run);
      run.silent = run.trigger === "schedule" && run.summary.errors === 0 && !conditionMet(run);
      this.push(run, "run_completed", run.silent ? "Finished quietly — nothing new worth your attention." : "Finished.");
    } catch (e) {
      if (e instanceof StopSignal) {
        this.finishStopped(run, ctl);
      } else if (e instanceof StageFailure) {
        run.error = e.error;
        if (run.status !== "FAILED") this.transition(run, "FAILED");
        run.completedAt = this.now();
        this.recomputeSummary(run);
        this.push(run, "run_failed", e.error.message, run.currentStage);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        run.error = { category: "fatal", message, actions: ["retry", "stop"] };
        if (run.status !== "FAILED" && run.status !== "CANCELLED") this.transition(run, "FAILED");
        run.completedAt = this.now();
        this.push(run, "run_failed", message, run.currentStage);
      }
    }
  }

  private finishStopped(run: WorkflowRun, ctl: RunControl) {
    if (run.status !== "STOPPING") return;
    const stage = this.currentStage(run);
    if (stage && stage.status === "STOPPING") this.transitionStage(stage, "STOPPED", run);
    for (const s of run.stages) if (s.status === "PENDING") s.status = "CANCELLED";
    this.transition(run, "STOPPED");
    run.completedAt = this.now();
    ctl.stopRequested = false;
    this.recomputeSummary(run);
    this.push(run, "run_stopped", "Stopped. Everything completed so far has been saved.");
  }

  private async executeStage(run: WorkflowRun, stage: WorkflowStageRun, ctl: RunControl) {
    const def = STAGES[stage.key];
    const executor = this.opts.executors[stage.key];
    const policy = this.opts.getPolicy();

    // Policy gate (spec §11–12): skip when turned off, ask when required.
    const decisions = def.capabilities.map((c) => resolveCapability(c, policy, run.config.automationLevel));
    if (def.capabilities.length && decisions.every((d) => d === "skip")) {
      stage.status = "CANCELLED";
      stage.evidence.push({ label: "Skipped", value: "Turned off in your automation settings", tone: "neutral" });
      this.push(run, "stage_completed", `${def.name} skipped (turned off in Automation Settings).`, stage.key);
      return;
    }

    for (;;) {
      ctl.restartRequested = false;
      stage.attempt += 1;
      stage.startedAt = this.now();
      stage.completedAt = undefined;
      stage.error = undefined;
      stage.progress = { current: 0, total: null, unit: def.unit ?? "items" };
      if (stage.attempt > 1) {
        stage.counts = {};
        stage.evidence = [];
        stage.warnings = [];
      }
      if (run.status === "PAUSED") {
        await ctl.pauseGate?.promise;
        if (ctl.stopRequested) throw new StopSignal();
      }
      if (stage.status !== "RUNNING") this.transitionStage(stage, "RUNNING", run);
      this.push(run, "stage_started", `${def.name} started.`, stage.key);

      const ctx = this.context(run, stage, ctl, policy);
      try {
        // Non-external stages ask up-front; external stages register concrete
        // actions and ask per action so the user sees exactly what will happen.
        if (!def.external && decisions.some((d) => d === "ask")) {
          const asks = def.capabilities.filter((c, i) => decisions[i] === "ask");
          await ctx.requestUser(`Wonder needs your permission to ${asks.map((c) => c.replace(/_/g, " ")).join(", ")}.`);
        }
        if (!executor) throw new StageFailure({ category: "fatal", message: `No executor for stage ${stage.key}`, actions: ["stop"] });
        const result = await executor(ctx);
        await ctx.checkpoint();
        run.outputs[stage.key] = {
          stageKey: stage.key,
          data: result.data,
          provenance: result.provenance ?? "AI_GENERATED",
          producedAt: this.now(),
        };
        if (result.counts) stage.counts = { ...stage.counts, ...result.counts };
        for (const w of result.warnings ?? []) stage.warnings.push(w);
        stage.completedAt = this.now();
        this.transitionStage(stage, stage.warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", run);
        this.recomputeSummary(run);
        this.push(run, "stage_completed", `${def.name} completed.`, stage.key);
        return;
      } catch (e) {
        if (e instanceof RestartSignal) {
          if (stage.status !== "RUNNING") stage.status = "RUNNING";
          continue;
        }
        if (e instanceof StopSignal) throw e;
        if (e instanceof StageFailure) {
          stage.error = e.error;
          stage.completedAt = this.now();
          this.transitionStage(stage, "FAILED", run);
          this.push(run, "stage_failed", e.error.message, stage.key);
          if (e.error.category === "partial" || e.error.category === "recoverable") {
            // Partial results survive (spec §44); the run continues with what it has.
            stage.status = "COMPLETED_WITH_WARNINGS";
            stage.warnings.push(e.error.message);
            if (!run.outputs[stage.key]) run.outputs[stage.key] = { stageKey: stage.key, data: {}, provenance: "SYSTEM_DERIVED", producedAt: this.now() };
            this.recomputeSummary(run);
            return;
          }
          throw e;
        }
        throw e;
      }
    }
  }

  private context(run: WorkflowRun, stage: WorkflowStageRun, ctl: RunControl, policy: AutomationPolicy): StageContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    let lastProgressEmit = 0;
    return {
      run,
      stage,
      get: <T,>(key: string) => engine.resolveValue(run, key) as T | undefined,
      output: <T,>(k: StageKey) => run.outputs[k]?.data as T | undefined,
      setProgress(current, total) {
        stage.progress = { current, total: total === undefined ? stage.progress.total : total, unit: stage.progress.unit };
        const t = Date.now();
        if (t - lastProgressEmit > 80) {
          lastProgressEmit = t;
          engine.changed(run, "progress");
        }
      },
      setCounts(counts) {
        stage.counts = { ...stage.counts, ...counts };
        engine.changed(run, "progress");
      },
      addEvidence(e) {
        stage.evidence.push(e);
        engine.changed(run, "stage");
      },
      warn(m) {
        stage.warnings.push(m);
        engine.changed(run, "stage");
      },
      async checkpoint() {
        if (ctl.stopRequested) throw new StopSignal();
        if (ctl.restartRequested) throw new RestartSignal();
        if (ctl.pauseGate) {
          await ctl.pauseGate.promise;
          if (ctl.stopRequested) throw new StopSignal();
          if (ctl.restartRequested) throw new RestartSignal();
        }
      },
      policy: (c) => resolveCapability(c, policy, run.config.automationLevel),
      async requestUser(reason) {
        if (ctl.stopRequested) throw new StopSignal();
        if (ctl.userGateSatisfied) {
          ctl.userGateSatisfied = false; // answered before the restore; don't ask twice
          return;
        }
        engine.transition(run, "WAITING_FOR_USER");
        engine.transitionStage(stage, "WAITING_FOR_USER", run);
        stage.waitingReason = reason;
        let resolve = () => {};
        const promise = new Promise<void>((r) => (resolve = r));
        ctl.userGate = { promise, resolve };
        engine.push(run, "stage_waiting", reason, stage.key);
        await promise;
        if (ctl.stopRequested) throw new StopSignal();
        if (ctl.restartRequested) throw new RestartSignal();
        if (run.status === "CANCELLED") throw new StopSignal();
      },
      registerAction(input) {
        const existing = engine.ledger.get(input.idempotencyKey);
        if (existing && existing.status === "succeeded") {
          const dup: WorkflowAction = {
            ...structuredClone(existing),
            id: newId("act"),
            runId: run.id,
            stageKey: stage.key,
            status: "skipped_duplicate",
            history: [...existing.history, { at: engine.now(), event: "skipped", detail: `Already executed in run ${existing.runId}` }],
          };
          run.actions.push(dup);
          engine.push(run, "action_skipped", `${input.label} — already done, not repeating.`, stage.key);
          return dup;
        }
        const found = run.actions.find((a) => a.idempotencyKey === input.idempotencyKey);
        if (found) return found;
        const action: WorkflowAction = {
          id: newId("act"),
          runId: run.id,
          stageKey: stage.key,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          targetId: input.targetId,
          label: input.label,
          status: "pending_confirmation",
          attempts: 0,
          createdAt: engine.now(),
          history: [{ at: engine.now(), event: "created" }],
        };
        run.actions.push(action);
        engine.changed(run, "stage");
        return action;
      },
      async executeAction(actionId, fn) {
        const a = run.actions.find((x) => x.id === actionId);
        if (!a) throw new Error("Unknown action");
        if (a.status !== "confirmed") return a;
        a.status = "executing";
        a.attempts += 1;
        a.history.push({ at: engine.now(), event: "executing", detail: `attempt ${a.attempts}` });
        engine.changed(run, "stage");
        try {
          await fn();
          a.status = "succeeded";
          a.executedAt = engine.now();
          a.history.push({ at: a.executedAt, event: "succeeded" });
          engine.ledger.set(a.idempotencyKey, a);
          engine.push(run, "action_executed", `${a.label} — done.`, stage.key);
        } catch (e) {
          a.status = "failed";
          a.error = e instanceof Error ? e.message : String(e);
          a.history.push({ at: engine.now(), event: "failed", detail: a.error });
          engine.changed(run, "stage");
        }
        return a;
      },
      sleep: (ms) => engine.sleepFn(ms),
      fail(error) {
        throw new StageFailure(error);
      },
    };
  }

  // ---------------------------------------------------------------- helpers
  private resolveValue(run: WorkflowRun, key: string): unknown {
    return resolveRunValue(run, key).value;
  }

  private recomputeSummary(run: WorkflowRun) {
    const s: RunSummary = emptySummary();
    const search = run.outputs.search?.data as { jobIds?: string[] } | undefined;
    const dedupe = run.outputs.dedupe?.data as { jobIds?: string[] } | undefined;
    const rank = run.outputs.rank?.data as { strongMatches?: number } | undefined;
    const prepare = run.outputs.prepare?.data as { applicationIds?: string[] } | undefined;
    s.jobsDiscovered = search?.jobIds?.length ?? run.stages.find((x) => x.key === "search")?.counts.discovered ?? 0;
    s.jobsRetained = dedupe?.jobIds?.length ?? 0;
    s.strongMatches = rank?.strongMatches ?? 0;
    s.applicationsPrepared = prepare?.applicationIds?.length ?? 0;
    s.actionsExecuted = run.actions.filter((a) => a.status === "succeeded").length;
    s.errors = run.stages.filter((x) => x.error && x.status === "FAILED").length + (run.error ? 1 : 0);
    s.warnings = run.stages.reduce((n, x) => n + x.warnings.length, 0);
    run.summary = s;
  }

  private newStage(runId: string, key: StageKey): WorkflowStageRun {
    return {
      id: newId("stg"),
      runId,
      key,
      status: "PENDING",
      attempt: 0,
      progress: { current: 0, total: null, unit: STAGES[key].unit ?? "items" },
      counts: {},
      evidence: [],
      warnings: [],
    };
  }

  private currentStage(run: WorkflowRun) {
    return run.currentStage ? run.stages.find((s) => s.key === run.currentStage) : undefined;
  }

  private transition(run: WorkflowRun, to: RunStatus) {
    run.status = assertTransition(run.status, to, "run");
    this.changed(run, "run");
  }

  private transitionStage(stage: WorkflowStageRun, to: RunStatus, run: WorkflowRun) {
    stage.status = assertTransition(stage.status, to, `stage:${stage.key}`);
    this.changed(run, "stage");
  }

  private event(type: RunEvent["type"], message: string, stageKey?: StageKey): RunEvent {
    return { id: newId("evt"), at: this.now(), type, message, stageKey };
  }

  private push(run: WorkflowRun, type: RunEvent["type"], message: string, stageKey?: StageKey) {
    const e = this.event(type, message, stageKey);
    run.events.push(e);
    this.opts.onEvent?.(run, e);
    this.changed(run, "run");
  }

  private changed(run: WorkflowRun, kind: "run" | "stage" | "progress") {
    this.opts.onChange?.(run, kind);
  }

  private mustGet(id: string) {
    const r = this.runs.get(id);
    if (!r) throw new Error(`Unknown run ${id}`);
    return r;
  }

  private control(id: string) {
    let c = this.controls.get(id);
    if (!c) {
      c = { restartRequested: false, stopRequested: false };
      this.controls.set(id, c);
    }
    return c;
  }
}

/** Evaluate a scheduled run's condition against its results (spec §18: silence is a valid outcome). */
export function conditionMet(run: Pick<WorkflowRun, "summary" | "config">): boolean {
  const c = run.config.scheduleCondition ?? { key: "strong_matches", op: ">", value: 0 };
  if (c.key === "always") return true;
  const actual = c.key === "strong_matches" ? run.summary.strongMatches : run.summary.jobsDiscovered;
  return actual > c.value;
}

export function emptySummary(): RunSummary {
  return { jobsDiscovered: 0, jobsRetained: 0, strongMatches: 0, applicationsPrepared: 0, actionsExecuted: 0, errors: 0, warnings: 0 };
}
