import { describe, expect, it } from "vitest";
import { WorkflowEngine, StopSignal, conditionMet, type StageExecutor } from "./engine";
import { canTransition, InvalidTransitionError, assertTransition } from "./status";
import { defaultPolicy, resolveCapability } from "@/domain/automation/policy";
import type { RunConfig } from "./types";

const config: RunConfig = {
  careerGoal: "PM roles",
  automationLevel: "guided",
  provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
  sourceIds: ["linkedin"],
  searchCriteria: { query: "product manager", locations: ["Bengaluru"], workModes: ["hybrid"] },
  minMatchThreshold: 70,
  maxResults: 50,
  notify: "strong_matches_only",
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const until = async (pred: () => boolean, max = 200) => {
  for (let i = 0; i < max && !pred(); i++) await tick();
  if (!pred()) throw new Error("condition not met");
};

function makeEngine(overrides: Partial<Record<string, StageExecutor>> = {}, level: RunConfig["automationLevel"] = "guided") {
  const simple: StageExecutor = async (ctx) => {
    for (let i = 1; i <= 3; i++) {
      await ctx.sleep(0);
      await ctx.checkpoint();
      ctx.setProgress(i, 3);
    }
    return { data: { done: true, jobIds: ["a", "b"] } };
  };
  const engine = new WorkflowEngine({
    executors: {
      profile: simple,
      search: async (ctx) => {
        for (let i = 1; i <= 5; i++) {
          await ctx.sleep(0);
          await ctx.checkpoint();
          ctx.setProgress(i, 5);
        }
        return { data: { jobIds: ["j1", "j2", "j3"] } };
      },
      dedupe: simple,
      understand: simple,
      match: async (ctx) => ({ data: { location: ctx.get("location") } }),
      quality: simple,
      rank: simple,
      prepare: simple,
      review: async (ctx) => {
        await ctx.requestUser("Review the prepared applications.");
        return { data: { approved: true } };
      },
      apply: async (ctx) => {
        const a = ctx.registerAction({ type: "submit_application", idempotencyKey: "app-1", targetId: "app-1", label: "Submit to Google" });
        if (a.status === "pending_confirmation") await ctx.requestUser("Approve submission");
        if (a.status === "confirmed") await ctx.executeAction(a.id, async () => {});
        return { data: { submitted: run(ctx).actions.filter((x) => x.status === "succeeded").length } };
      },
      track: simple,
      learn: simple,
      ...overrides,
    },
    getPolicy: () => defaultPolicy(),
    sleep: () => new Promise<void>((r) => setTimeout(r, 0)),
  });
  const run = (ctx: { run: unknown }) => ctx.run as { actions: { status: string }[] };
  const created = engine.createRun({ workflowId: "wf", workflowName: "Test", workflowVersion: 1, trigger: "manual", config: { ...config, automationLevel: level }, inputs: [{ key: "location", label: "Location", value: "Mumbai", provenance: "AI_GENERATED", updatedAt: "" }] });
  return { engine, run: created };
}

describe("state machine", () => {
  it("allows the documented transitions", () => {
    expect(canTransition("PENDING", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "STOPPING")).toBe(true);
    expect(canTransition("STOPPING", "STOPPED")).toBe(true);
    expect(canTransition("RUNNING", "WAITING_FOR_USER")).toBe(true);
    expect(canTransition("WAITING_FOR_USER", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED_WITH_WARNINGS")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransition("STOPPED", "RUNNING")).toBe(false);
    expect(canTransition("PENDING", "PAUSED")).toBe(false);
    expect(() => assertTransition("STOPPED", "RUNNING")).toThrow(InvalidTransitionError);
  });
});

describe("policy", () => {
  it("never runs high-risk capabilities without explicit automatic policy + autonomous level", () => {
    const p = defaultPolicy();
    expect(resolveCapability("submit_application", p, "autonomous")).toBe("ask");
    expect(resolveCapability("submit_application", { ...p, submit_application: "automatic" }, "guided")).toBe("ask");
    expect(resolveCapability("submit_application", { ...p, submit_application: "automatic" }, "autonomous")).toBe("run");
    expect(resolveCapability("search_jobs", p, "assist")).toBe("run");
    expect(resolveCapability("generate_resume", p, "assist")).toBe("ask");
    expect(resolveCapability("generate_resume", p, "guided")).toBe("run");
    expect(resolveCapability("generate_resume", { ...p, generate_resume: "off" }, "guided")).toBe("skip");
  });
});

describe("engine", () => {
  it("runs to review, waits for the user, asks before external actions, and completes", async () => {
    const { engine, run } = makeEngine();
    const loop = engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.currentStage).toBe("review");
    expect(run.outputs.search?.data.jobIds).toEqual(["j1", "j2", "j3"]);
    engine.continueFromUser(run.id);
    await until(() => run.status === "WAITING_FOR_USER" && run.currentStage === "apply");
    const action = run.actions[0];
    expect(action.status).toBe("pending_confirmation");
    engine.confirmAction(run.id, action.id);
    engine.continueFromUser(run.id);
    await loop;
    expect(run.status).toBe("COMPLETED");
    expect(run.actions[0].status).toBe("succeeded");
    expect(run.summary.actionsExecuted).toBe(1);
    expect(run.stages.every((s) => s.status === "COMPLETED")).toBe(true);
  });

  it("pauses and resumes without losing progress", async () => {
    const { engine, run } = makeEngine();
    const loop = engine.start(run.id);
    await until(() => run.currentStage === "search" && run.stages[1].progress.current >= 1);
    engine.pause(run.id);
    expect(run.status).toBe("PAUSED");
    const before = run.stages[1].progress.current;
    for (let i = 0; i < 10; i++) await tick();
    expect(run.stages[1].progress.current).toBe(before);
    engine.resume(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    engine.stop(run.id);
    await loop;
    expect(run.status).toBe("STOPPED");
  });

  it("stops gracefully and preserves completed outputs", async () => {
    const { engine, run } = makeEngine();
    const loop = engine.start(run.id);
    await until(() => run.currentStage === "dedupe");
    engine.stop(run.id);
    expect(run.status).toBe("STOPPING");
    await loop;
    expect(run.status).toBe("STOPPED");
    expect(run.outputs.search?.data.jobIds).toHaveLength(3);
    expect(run.stages.find((s) => s.key === "search")?.status).toBe("COMPLETED");
    expect(run.stages.find((s) => s.key === "rank")?.status).toBe("CANCELLED");
  });

  it("uses user-modified values in subsequent stages and records provenance", async () => {
    const { engine, run } = makeEngine();
    const o = engine.applyOverride(run.id, { stageKey: "profile", key: "location", label: "Preferred location", value: "Mumbai, Bengaluru, Remote" });
    expect(o.provenance).toBe("USER_MODIFIED");
    expect(o.previousValue).toBe("Mumbai");
    const loop = engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.outputs.match?.data.location).toBe("Mumbai, Bengaluru, Remote");
    engine.stop(run.id);
    await loop;
  });

  it("reruns from a stage, inheriting earlier outputs and never repeating external actions", async () => {
    const { engine, run } = makeEngine();
    const loop = engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    engine.continueFromUser(run.id);
    await until(() => run.status === "WAITING_FOR_USER" && run.currentStage === "apply");
    engine.confirmAction(run.id, run.actions[0].id);
    engine.continueFromUser(run.id);
    await loop;
    expect(run.status).toBe("COMPLETED");

    const child = engine.rerunFrom(run.id, "prepare");
    expect(child.parentRunId).toBe(run.id);
    expect(child.outputs.search?.inheritedFromRunId).toBe(run.id);
    expect(child.stages.find((s) => s.key === "search")?.status).toBe("COMPLETED");
    expect(child.stages.find((s) => s.key === "prepare")?.status).toBe("PENDING");
    const loop2 = engine.start(child.id);
    await until(() => child.status === "WAITING_FOR_USER");
    engine.continueFromUser(child.id);
    await loop2;
    expect(child.status).toBe("COMPLETED");
    expect(child.actions[0].status).toBe("skipped_duplicate");
    expect(child.summary.actionsExecuted).toBe(0);
  });

  it("restarts the current stage", async () => {
    const { engine, run } = makeEngine();
    const loop = engine.start(run.id);
    await until(() => run.currentStage === "search" && run.stages[1].progress.current >= 2);
    engine.restartStage(run.id);
    await until(() => run.stages[1].attempt === 2);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.stages[1].status).toBe("COMPLETED");
    engine.stop(run.id);
    await loop;
  });

  it("keeps partial results when a source fails and marks the run with warnings", async () => {
    const { engine, run } = makeEngine({
      search: async (ctx) => {
        ctx.setCounts({ discovered: 900 });
        return ctx.fail({ category: "partial", message: "Naukri is temporarily unavailable. Other sources completed successfully.", source: "naukri", actions: ["retry", "continue"] });
      },
    });
    const loop = engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.stages[1].status).toBe("COMPLETED_WITH_WARNINGS");
    expect(run.stages[1].counts.discovered).toBe(900);
    engine.continueFromUser(run.id);
    await until(() => run.status === "WAITING_FOR_USER" && run.currentStage === "apply");
    engine.rejectAction(run.id, run.actions[0].id);
    engine.continueFromUser(run.id);
    await loop;
    expect(run.status).toBe("COMPLETED_WITH_WARNINGS");
    expect(run.actions[0].status).toBe("rejected");
  });

  it("fails fatally with an understandable error and does not erase earlier outputs", async () => {
    const { engine, run } = makeEngine({
      understand: async (ctx) => ctx.fail({ category: "fatal", message: "Your AI provider rejected the request (invalid API key).", source: "anthropic", actions: ["fix_config", "change_provider", "stop"] }),
    });
    await engine.start(run.id);
    expect(run.status).toBe("FAILED");
    expect(run.error?.actions).toContain("change_provider");
    expect(run.outputs.dedupe).toBeDefined();
  });

  it("assist level asks before medium-risk stages", async () => {
    const { engine, run } = makeEngine({}, "assist");
    const loop = engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.currentStage).toBe("prepare");
    engine.stop(run.id);
    await loop;
    expect(run.status).toBe("STOPPED");
  });

  it("exposes StopSignal for executors", () => {
    expect(new StopSignal().name).toBe("StopSignal");
  });
});

describe("schedule conditions", () => {
  const base = { summary: { jobsDiscovered: 120, jobsRetained: 90, strongMatches: 0, applicationsPrepared: 0, actionsExecuted: 0, errors: 0, warnings: 0 } };
  it("defaults to strong matches > 0", () => {
    expect(conditionMet({ ...base, config })).toBe(false);
    expect(conditionMet({ summary: { ...base.summary, strongMatches: 2 }, config })).toBe(true);
  });
  it("supports new_jobs thresholds and always", () => {
    expect(conditionMet({ ...base, config: { ...config, scheduleCondition: { key: "new_jobs", op: ">", value: 100 } } })).toBe(true);
    expect(conditionMet({ ...base, config: { ...config, scheduleCondition: { key: "new_jobs", op: ">", value: 500 } } })).toBe(false);
    expect(conditionMet({ ...base, config: { ...config, scheduleCondition: { key: "always", op: ">", value: 0 } } })).toBe(true);
  });
});

describe("restore", () => {
  it("keeps a run that was waiting for the user and continues it after a reload", async () => {
    const { engine, run } = makeEngine();
    void engine.start(run.id);
    await until(() => run.status === "WAITING_FOR_USER");
    expect(run.currentStage).toBe("review");
    // A new process: the same persisted run, no executor parked on the gate.
    const { engine: restored } = makeEngine();
    restored.hydrate([structuredClone(run)]);
    const again = restored.getRun(run.id)!;
    expect(again.status).toBe("WAITING_FOR_USER");
    expect(again.stages.find((s) => s.key === "review")?.status).toBe("WAITING_FOR_USER");
    restored.continueFromUser(again.id);
    await until(() => again.currentStage !== "review" || ["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"].includes(again.status));
    expect(again.stages.find((s) => s.key === "review")?.status).toBe("COMPLETED");
    expect(again.stages.filter((s) => s.key === "prepare")[0].status).toBe("COMPLETED"); // earlier work preserved, not redone
  });

  it("still stops runs that were mid-stage when the process died", () => {
    const { engine, run } = makeEngine();
    run.status = "RUNNING";
    run.stages[1].status = "RUNNING";
    run.currentStage = "search";
    engine.hydrate([run]);
    expect(engine.getRun(run.id)!.status).toBe("STOPPED");
  });
});

