import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_SOURCES, isAvailable, runConnector } from "./registry";
import { fixtureJobs, fixtureJobsOn } from "./e2eFixture";

const source = (id: string) => BUILTIN_SOURCES.find((s) => s.id === id)!;
const criteria = (query: string) => ({ query, locations: [], workModes: [], levels: [] }) as never;

afterEach(() => vi.unstubAllEnvs());

describe("the end-to-end fixture source", () => {
  it("is off unless WJ_E2E_FIXTURE_JOBS=1: nothing answers from it, and a source without credentials stays unavailable", async () => {
    expect(fixtureJobsOn()).toBe(false);
    vi.stubEnv("WJ_E2E_FIXTURE_JOBS", "");
    expect(fixtureJobsOn()).toBe(false);
    expect(await isAvailable(source("adzuna_in"))).toBe(false);
  });

  it("when on, every built-in source answers from the sample postings through the real connector entry point", async () => {
    vi.stubEnv("WJ_E2E_FIXTURE_JOBS", "1");
    expect(fixtureJobsOn()).toBe(true);
    expect(await isAvailable(source("adzuna_in"))).toBe(true);
    const r = await runConnector(source("remotive"), criteria(""), "standard" as never);
    expect(r.warnings).toEqual([]);
    expect(r.jobs.length).toBeGreaterThan(0);
    expect(r.jobs.every((j) => j.sourceId === "remotive")).toBe(true);
  });

  it("leaves WonderWorks employers real: its listings are jobs the test itself posted in a hiring workspace", async () => {
    vi.stubEnv("WJ_E2E_FIXTURE_JOBS", "1");
    const r = await runConnector(source("employers"), criteria(""), "standard" as never);
    expect(r.jobs.every((j) => !j.id.startsWith("job_"))).toBe(true);
  });

  it("sources that share one legacy id split it: only the first answers, so a posting isn't counted three times", async () => {
    const all = BUILTIN_SOURCES;
    const [gh, lever, ashby] = await Promise.all(["greenhouse", "lever", "ashby"].map((id) => fixtureJobs(source(id), criteria(""), all)));
    expect(gh.length).toBeGreaterThan(0);
    expect(lever).toEqual([]);
    expect(ashby).toEqual([]);
  });

  it("answers a search with the postings that match its words, and none for words nothing matches", async () => {
    const all = BUILTIN_SOURCES;
    const designers = await fixtureJobs(source("greenhouse"), criteria("designer"), all);
    expect(designers.length).toBeGreaterThan(0);
    expect(designers.every((j) => /design/i.test(`${j.title} ${j.tags.join(" ")} ${j.skills.join(" ")}`))).toBe(true);
    expect(await fixtureJobs(source("greenhouse"), criteria("zzzz no such role"), all)).toEqual([]);
  });
});
