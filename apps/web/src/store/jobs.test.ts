import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import * as mode from "@/lib/mode";
import { useJobsStore } from "./jobs";

const job = (id: string) => ({ id, title: id, company: "Acme", postedAt: "2026-10-01T00:00:00Z", description: "" }) as unknown as CanonicalJob;
const match = (jobId: string, score: number) => ({ jobId, score, fit: "strong" }) as unknown as JobMatch;

describe("clearing typed words", () => {
  beforeEach(() => useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined, wordsCatalog: undefined, beforeRun: undefined, recentSearches: [], refine: {}, sort: "best_match", filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } }));

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

  it("keep Part Time's last results too, so Part Time shows them after a reload without searching again", () => {
    vi.spyOn(mode, "getClientMode").mockReturnValue({ mode: "user" } as ReturnType<typeof mode.getClientMode>);
    useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined, wordsCatalog: undefined });
    const s = useJobsStore.getState();
    const full = (id: string) => ({ ...job(id), description: "A real posting." }) as CanonicalJob;
    s.replaceCatalog([full("p")]);
    s.replaceCatalog([full("barista")], "barista in pune");
    s.setMatches([match("barista", 60)]);
    // Back to Full Time: the profile's list on screen, Part Time's set aside.
    expect(useJobsStore.getState().restoreProfileCatalog()).toBe(true);
    const opts = useJobsStore.persist.getOptions();
    const stored = JSON.parse(JSON.stringify(opts.partialize!(useJobsStore.getState())));
    expect(stored.wordsCatalog?.searchedFor).toBe("barista in pune");
    expect(stored.wordsCatalog?.order).toEqual(["barista"]);
    // After the reload, opening Part Time puts them back.
    useJobsStore.setState(opts.merge!(stored, useJobsStore.getState()) as Partial<ReturnType<typeof useJobsStore.getState>>);
    expect(useJobsStore.getState().restoreWordsCatalog()).toBe(true);
    expect(useJobsStore.getState().order).toEqual(["barista"]);
    expect(useJobsStore.getState().searchedFor).toBe("barista in pune");
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

describe("Apply opened on the employer's site", () => {
  it("is remembered with the account so the job's page asks how it went", () => {
    const st = () => useJobsStore.getState();
    st().markApplyOpened("job-1");
    expect(st().applyOpenedAt["job-1"]).toBeTruthy();
    const opts = useJobsStore.persist.getOptions();
    const saved = opts.partialize!(st()) as { applyOpenedAt?: Record<string, string> };
    expect(Object.keys(saved.applyOpenedAt ?? {})).toContain("job-1");
    const fresh = { ...st(), applyOpenedAt: {} };
    expect((opts.merge!(saved, fresh) as { applyOpenedAt: Record<string, string> }).applyOpenedAt["job-1"]).toBeTruthy();
  });
});

describe("Saved's Easy Apply only", () => {
  it("is kept with the account, apart from Find's sources, and survives a mode switch", () => {
    const st = () => useJobsStore.getState();
    st().setFilters({ savedEasyApply: true });
    const opts = useJobsStore.persist.getOptions();
    const saved = opts.partialize!(st()) as { savedEasyApply?: boolean };
    expect(saved.savedEasyApply).toBe(true);
    const fresh = { ...st(), filters: { ...st().filters, savedEasyApply: false } };
    expect((opts.merge!(saved, fresh) as { filters: { savedEasyApply?: boolean } }).filters.savedEasyApply).toBe(true);
    // Find's Refine is untouched by it.
    expect(st().filters.sourceIds).toEqual([]);
    st().switchFindMode("part_time");
    expect(st().filters.savedEasyApply).toBe(true);
    st().switchFindMode("full_time");
    st().setFilters({ savedEasyApply: false });
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

  it("keeps Part Time's last five searches, newest first, once each; × forgets one", () => {
    const { rememberSearch, forgetSearch } = useJobsStore.getState();
    for (const t of ["barista", "  Barista  in   Pune ", "designer", "BARISTA", "a", "b", "c"]) rememberSearch(t);
    expect(useJobsStore.getState().recentSearches).toEqual(["c", "b", "a", "BARISTA", "designer"]);
    rememberSearch("   ");
    forgetSearch("a");
    expect(useJobsStore.getState().recentSearches).toEqual(["c", "b", "BARISTA", "designer"]);
  });

});

describe("Refine, per Find mode", () => {
  beforeEach(() => useJobsStore.setState({ refine: {}, sort: "best_match", filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } }));

  it("keeps Full Time's and Part Time's Refine settings apart, and brings each back on switching", () => {
    const st = () => useJobsStore.getState();
    st().setFilters({ workModes: ["remote"], hideInPipeline: true });
    st().setSort("date");
    st().switchFindMode("part_time");
    expect(st().filters).toMatchObject({ skipProfile: true, workModes: [], hideInPipeline: false });
    expect(st().sort).toBe("best_match");
    st().setFilters({ freshnessDays: 3, levels: ["junior"] });
    st().setSort("salary");
    st().switchFindMode("full_time");
    expect(st().filters).toMatchObject({ skipProfile: false, workModes: ["remote"], hideInPipeline: true, freshnessDays: null, levels: [] });
    expect(st().sort).toBe("date");
    st().switchFindMode("part_time");
    expect(st().filters).toMatchObject({ freshnessDays: 3, levels: ["junior"], workModes: [] });
    expect(st().sort).toBe("salary");
    // Typing in the box changes nothing Refine keeps: the same settings object.
    const before = st().refine;
    st().setFilters({ query: "barista" });
    expect(st().refine).toBe(before);
  });

  it("persists both modes' Refine settings and restores the last-used mode's", () => {
    const st = () => useJobsStore.getState();
    st().setFilters({ workModes: ["hybrid"] });
    st().switchFindMode("part_time");
    st().setFilters({ salaryListed: true });
    const opts = useJobsStore.persist.getOptions();
    const saved = JSON.parse(JSON.stringify(opts.partialize!(st())));
    const merged = opts.merge!(saved, { ...st(), refine: {}, filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } }) as ReturnType<typeof st>;
    expect(merged.filters).toMatchObject({ skipProfile: true, salaryListed: true, workModes: [] });
    expect(merged.refine.full_time).toMatchObject({ workModes: ["hybrid"] });
    // Before per-mode settings: Hide Pipeline alone was kept, and still is.
    const legacy = opts.merge!({ hideInPipeline: true, sort: "date" }, st()) as ReturnType<typeof st>;
    expect(legacy.filters).toMatchObject({ hideInPipeline: true, skipProfile: false });
    expect(legacy.sort).toBe("date");
    expect(opts.merge!({ refine: { full_time: { workModes: [1, "remote"], sort: "nope" } } }, st()) as ReturnType<typeof st>).toMatchObject({ sort: "best_match", filters: { workModes: ["remote"] } });
  });

  it("keeps each mode's places, job types and view too — across switching modes and a reload", () => {
    const st = () => useJobsStore.getState();
    st().switchFindMode("full_time");
    st().setFilters({ locations: ["Dubai", "London"], jobTypes: ["contract"], minFit: "strong", minSalary: 2_000_000 });
    st().switchFindMode("part_time");
    // Part Time starts from its own: anywhere, every job type, All.
    expect(st().filters).toMatchObject({ locations: [], jobTypes: [], minFit: null });
    st().setFilters({ locations: ["Pune"], jobTypes: ["gig"] });
    st().switchFindMode("full_time");
    expect(st().filters).toMatchObject({ locations: ["Dubai", "London"], jobTypes: ["contract"], minFit: "strong", minSalary: 2_000_000 });
    // A reload brings back the last-used mode's, and keeps the other's for the switch.
    const opts = useJobsStore.persist.getOptions();
    const saved = JSON.parse(JSON.stringify(opts.partialize!(st())));
    const merged = opts.merge!(saved, { ...st(), refine: {}, filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } }) as ReturnType<typeof st>;
    expect(merged.filters).toMatchObject({ locations: ["Dubai", "London"], jobTypes: ["contract"], minFit: "strong" });
    expect(merged.refine.part_time).toMatchObject({ locations: ["Pune"], jobTypes: ["gig"] });
    // Full Time with nothing picked keeps following the Career Profile's places.
    st().setFilters({ locations: undefined });
    expect((JSON.parse(JSON.stringify(opts.partialize!(st()))).refine.full_time as { locations?: string[] }).locations).toBeUndefined();
  });

  it("keeps Saved's filter history apart from Find's", () => {
    useJobsStore.setState({ recentSearches: [], recentSavedSearches: [] });
    const { rememberSearch, forgetSearch } = useJobsStore.getState();
    rememberSearch("barista");
    rememberSearch("interactive", "saved");
    rememberSearch("Interactive", "saved");
    expect(useJobsStore.getState().recentSearches).toEqual(["barista"]);
    expect(useJobsStore.getState().recentSavedSearches).toEqual(["Interactive"]);
    forgetSearch("Interactive", "saved");
    expect(useJobsStore.getState().recentSavedSearches).toEqual([]);
    expect(useJobsStore.getState().recentSearches).toEqual(["barista"]);
  });
});

describe("a job opened outside Find's list", () => {
  it("is compared with the Career Profile on demand, once, and keeps an existing match", () => {
    const full = { ...job("x"), location: "Remote", country: "", workMode: "remote", currency: "USD", observedAt: "2026-10-01T00:00:00Z", description: "Build billing APIs.", requirements: [], niceToHave: [], skills: ["APIs"], seniority: "senior", industry: "Technology", applyUrl: "https://acme.test/x", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], canonicalKey: "x", sourceIds: ["greenhouse"], duplicateOf: [] } as unknown as CanonicalJob;
    useJobsStore.setState({ jobs: { x: full }, order: [], matches: {}, aiFits: {}, filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } });
    useJobsStore.getState().scoreOne("x");
    const m = useJobsStore.getState().matches.x;
    expect(m?.jobId).toBe("x");
    expect(typeof m?.score).toBe("number");
    useJobsStore.setState({ matches: { x: match("x", 99) } });
    useJobsStore.getState().scoreOne("x");
    expect(useJobsStore.getState().matches.x.score).toBe(99);
    useJobsStore.getState().scoreOne("missing");
    expect(useJobsStore.getState().matches.missing).toBeUndefined();
  });
});

describe("Part Time's search words", () => {
  it("come back in the box after a trip to Full Time", () => {
    useJobsStore.setState({ refine: {}, partTimeQuery: "", filters: { query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false } });
    const s = useJobsStore.getState();
    s.switchFindMode("part_time");
    useJobsStore.getState().setFilters({ query: "database admin" });
    useJobsStore.getState().switchFindMode("full_time");
    expect(useJobsStore.getState().filters.query).toBe("");
    useJobsStore.getState().switchFindMode("part_time");
    expect(useJobsStore.getState().filters.query).toBe("database admin");
  });
});
