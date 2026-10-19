import { describe, expect, it } from "vitest";
import type { WorkflowRun } from "@/domain/workflow/types";
import { compactRuns } from "./workflow";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `job_${i}`);
const run = (i: number, status = "COMPLETED"): WorkflowRun =>
  ({
    id: `run_${i}`,
    status,
    createdAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(),
    outputs: { search: { data: { jobIds: ids(400), perSource: { a: 400 } } }, rank: { data: { rankedJobIds: ids(100), strongMatches: 4 } } },
    events: Array.from({ length: 80 }, (_, e) => ({ at: "", message: `e${e}` })),
  }) as unknown as WorkflowRun;

describe("the run history kept between sessions", () => {
  it("keeps the newest runs whole and trims older ones' job-id lists and events, never their shortlist or counts", () => {
    const runs = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`run_${i}`, run(i)]));
    const out = compactRuns(runs);
    expect(Object.keys(out)).toHaveLength(15);
    // Newest (run_14 … run_5): untouched.
    expect(out.run_14).toBe(runs.run_14);
    expect(out.run_5).toBe(runs.run_5);
    // Older: trimmed.
    const old = out.run_0;
    expect((old.outputs.search!.data.jobIds as string[]).length).toBe(50);
    expect(old.outputs.search!.data.perSource).toEqual({ a: 400 });
    expect((old.outputs.rank!.data.rankedJobIds as string[]).length).toBe(100);
    expect(old.outputs.rank!.data.strongMatches).toBe(4);
    expect(old.events).toHaveLength(30);
    expect(JSON.stringify(old).length).toBeLessThan(JSON.stringify(runs.run_0).length * 0.6);
  });

  it("never trims a run that's still going", () => {
    const runs = Object.fromEntries([...Array.from({ length: 12 }, (_, i) => [`run_${i + 1}`, run(i + 1)]), ["run_0", run(0, "RUNNING")]]);
    expect(compactRuns(runs).run_0).toBe(runs.run_0);
  });
});
