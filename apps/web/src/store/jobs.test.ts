import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import * as mode from "@/lib/mode";
import { useJobsStore } from "./jobs";

const job = (id: string) => ({ id, title: id, company: "Acme", postedAt: "2026-10-01T00:00:00Z" }) as unknown as CanonicalJob;
const match = (jobId: string, score: number) => ({ jobId, score, fit: "strong" }) as unknown as JobMatch;

describe("clearing typed words", () => {
  beforeEach(() => useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined, wordsCatalog: undefined, beforeRun: undefined }));

  it("brings back the profile's results and their scores after a typed search replaced them", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]);
    s.setMatches([match("a", 80), match("b", 70)]);
    s.replaceCatalog([job("sg")], "Singapore");
    s.setMatches([match("sg", 30), match("a", 10)]); // a job both searches found is re-scored for the words
    s.replaceCatalog([job("sg"), job("sg2")], "Singapore jobs"); // words on words keep the profile's results aside
    expect(useJobsStore.getState().order).toEqual(["sg", "sg2"]);

    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(true);
    const after = useJobsStore.getState();
    expect(after.order).toEqual(["a", "b"]);
    expect(after.searchedFor).toBe("");
    expect(after.matches.a.score).toBe(80);
    expect(after.restoreProfileCatalog()).toBe(false); // nothing kept twice
  });

  it("Full Time and Part Time each keep their own results: switching swaps them back and forth, nothing is searched", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]); // Full Time: the profile's search
    s.setMatches([match("a", 80)]);
    s.replaceCatalog([job("w1"), job("w2")], "weekend barista"); // Part Time: typed words
    // To Full Time: the profile's results; the words' set aside.
    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(true);
    expect(useJobsStore.getState().order).toEqual(["a", "b"]);
    expect(useJobsStore.getState().wordsCatalog?.searchedFor).toBe("weekend barista");
    // Back to Part Time: the words' results and what they were searched for; the profile's set aside again.
    expect(useJobsStore.getState().restoreWordsCatalog()).toBe(true);
    let st = useJobsStore.getState();
    expect(st.order).toEqual(["w1", "w2"]);
    expect(st.searchedFor).toBe("weekend barista");
    expect(st.beforeWords?.order).toEqual(["a", "b"]);
    expect(st.restoreWordsCatalog()).toBe(false); // nothing kept twice
    // And to Full Time once more, with the profile's own scores.
    expect(st.restoreProfileCatalog()).toBe(true);
    st = useJobsStore.getState();
    expect(st.order).toEqual(["a", "b"]);
    expect(st.matches.a.score).toBe(80);
  });

  it("Stop brings back the list as it was before that search started, keeping what was saved meanwhile", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]);
    s.keepBeforeRun("run_1");
    s.replaceCatalog([job("x")], "designer"); // the search's first jobs replace the list
    useJobsStore.setState((st) => ({ saved: { ...st.saved, x: "2026-10-22T00:00:00Z" } }));
    expect(useJobsStore.getState().restoreBeforeRun("run_2")).toBe(false); // another search's snapshot
    expect(useJobsStore.getState().restoreBeforeRun("run_1")).toBe(true);
    const st = useJobsStore.getState();
    expect(st.order).toEqual(["a", "b"]);
    expect(st.searchedFor).toBe("");
    expect(st.jobs.x).toBeTruthy(); // saved during the search: still there for Saved
    expect(st.restoreBeforeRun("run_1")).toBe(false); // once
  });

  it("has no Part Time results to bring back before Part Time has searched", () => {
    useJobsStore.getState().replaceCatalog([job("a")]);
    expect(useJobsStore.getState().restoreWordsCatalog()).toBe(false);
    expect(useJobsStore.getState().order).toEqual(["a"]);
  });

  it("keeps nothing when the profile's own search replaces the results, and leaves out jobs found closed since", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]);
    s.replaceCatalog([job("sg")], "Singapore");
    useJobsStore.setState({ closed: { b: { at: new Date().toISOString(), reason: "Closed on acme.com" } } });
    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(true);
    expect(useJobsStore.getState().order).toEqual(["a"]);

    s.replaceCatalog([job("sg")], "Singapore");
    s.replaceCatalog([job("c")]);
    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(false);
  });
});

describe("saved jobs outlive the search results", () => {
  beforeEach(() => useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined }));

  it("keeps a saved job's details when a new search replaces the results, and restores lost ones without listing them", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]);
    useJobsStore.setState({ saved: { a: "2026-10-09T00:00:00Z" } });
    s.replaceCatalog([job("c")]);
    expect(Object.keys(useJobsStore.getState().jobs).sort()).toEqual(["a", "c"]);
    expect(useJobsStore.getState().order).toEqual(["c"]);
    s.restoreJobs([job("z"), { ...job("c"), title: "stale copy" }]);
    expect(useJobsStore.getState().jobs.z).toBeDefined();
    expect(useJobsStore.getState().jobs.c.title).toBe("c"); // a known job isn't overwritten
    expect(useJobsStore.getState().order).toEqual(["c"]);
  });
});

describe("the profile's results set aside under typed words", () => {
  it("are saved with the account, so clearing the words after a reload brings them back", () => {
    vi.spyOn(mode, "getClientMode").mockReturnValue({ mode: "user" } as ReturnType<typeof mode.getClientMode>);
    useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined });
    const s = useJobsStore.getState();
    const full = (id: string, description = "A real posting.") => ({ ...job(id), description }) as CanonicalJob;
    s.replaceCatalog([full("a", "x".repeat(3000)), full("b")]);
    s.setMatches([match("a", 80), match("b", 70)]);
    s.replaceCatalog([full("music")], "music");
    const saved = useJobsStore.persist.getOptions().partialize!(useJobsStore.getState()) as { beforeWords?: { order: string[]; jobs: Record<string, CanonicalJob>; matches: Record<string, JobMatch> } };
    expect(saved.beforeWords?.order).toEqual(["a", "b"]);
    expect(saved.beforeWords?.matches.a.score).toBe(80);
    expect(saved.beforeWords!.jobs.a.description.length).toBeLessThan(1600); // kept short in storage
    vi.restoreAllMocks();
  });
});

describe("Hide Pipeline", () => {
  it("is saved with the account and comes back after a reload", () => {
    useJobsStore.getState().setFilters({ hideInPipeline: true, skipProfile: true });
    const opts = useJobsStore.persist.getOptions();
    const saved = opts.partialize!(useJobsStore.getState()) as { hideInPipeline?: boolean };
    expect(saved.hideInPipeline).toBe(true);
    expect((saved as { skipProfile?: boolean }).skipProfile).toBe(true);
    const fresh = { ...useJobsStore.getState(), filters: { ...useJobsStore.getState().filters, hideInPipeline: false } };
    expect((opts.merge!(saved, fresh) as { filters: { hideInPipeline?: boolean } }).filters.hideInPipeline).toBe(true);
    useJobsStore.getState().setFilters({ hideInPipeline: false });
    expect((opts.partialize!(useJobsStore.getState()) as { hideInPipeline?: boolean }).hideInPipeline).toBe(false);
  });
});

describe("a running search's arrivals", () => {
  beforeEach(() => useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined }));

  it("adds later arrivals after the first, once each; the finished search's list settles it — and the profile's results stay aside", () => {
    const s = useJobsStore.getState();
    s.replaceCatalog([job("a"), job("b")]);
    // A typed search streams in: the first batch replaces the list, the rest are added.
    s.replaceCatalog([job("x")], "designer");
    s.appendCatalog([job("y"), job("x")]);
    expect(useJobsStore.getState().order).toEqual(["x", "y"]);
    // Done: what the search finally found (a preview job that dropped out is gone).
    s.replaceCatalog([job("y"), job("z")], "designer");
    expect(useJobsStore.getState().order).toEqual(["y", "z"]);
    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(true);
    expect(useJobsStore.getState().order).toEqual(["a", "b"]);
  });

  it("doesn't bring back a posting found closed this week", () => {
    useJobsStore.setState({ closed: { y: { at: new Date().toISOString() } } as never });
    useJobsStore.getState().appendCatalog([job("y")]);
    expect(useJobsStore.getState().order).toEqual([]);
  });
});
