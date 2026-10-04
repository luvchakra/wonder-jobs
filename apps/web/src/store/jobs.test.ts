import { beforeEach, describe, expect, it } from "vitest";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import { useJobsStore } from "./jobs";

const job = (id: string) => ({ id, title: id, company: "Acme", postedAt: "2026-10-01T00:00:00Z" }) as unknown as CanonicalJob;
const match = (jobId: string, score: number) => ({ jobId, score, fit: "strong" }) as unknown as JobMatch;

describe("clearing typed words", () => {
  beforeEach(() => useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, saved: {}, searchedFor: "", beforeWords: undefined }));

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
