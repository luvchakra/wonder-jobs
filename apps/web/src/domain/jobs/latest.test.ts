import { describe, expect, it } from "vitest";
import type { WorkflowRun } from "@/domain/workflow/types";
import { catalogKey, LATEST_WORDS, wordsQuery } from "./latest";
import { catalogSearchRun } from "./readiness";

const cfg = (query: string, origin: "profile" | "words", role?: { id: string; title: string }) => ({ origin, role, searchCriteria: { query, locations: [], workModes: [] } }) as unknown as WorkflowRun["config"];

describe("Part Time's latest jobs (owner, 2026-11-01: an empty search shows the latest listings)", () => {
  it("files Part Time's empty-box search under its own catalog, apart from the profile's and from typed words", () => {
    expect(catalogKey(cfg("", "words"))).toBe(LATEST_WORDS);
    expect(catalogKey(cfg("barista", "words"))).toBe("barista");
    expect(catalogKey(cfg("", "profile"))).toBe("");
    expect(catalogKey(cfg("iam director", "profile"))).toBe("");
    expect(catalogKey(cfg("", "words", { id: "r1", title: "Director" }))).toBe("");
  });

  it("never matches or shows the marker as words", () => {
    expect(wordsQuery(LATEST_WORDS)).toBeUndefined();
    expect(wordsQuery("")).toBeUndefined();
    expect(wordsQuery("barista")).toBe("barista");
  });

  it("finds the latest-jobs run behind Part Time's list", () => {
    const run = (id: string, config: WorkflowRun["config"], at: string) => ({ id, config, status: "COMPLETED", createdAt: at, completedAt: at, stages: [{ key: "search" }] }) as unknown as WorkflowRun;
    const latest = run("a", cfg("", "words"), "2026-11-01T09:00:00Z");
    const profile = run("b", cfg("", "profile"), "2026-11-01T10:00:00Z");
    expect(catalogSearchRun([latest, profile], LATEST_WORDS)?.id).toBe("a");
    expect(catalogSearchRun([latest, profile], "")?.id).toBe("b");
  });
});
