import { describe, expect, it } from "vitest";
import { EMPTY_DNA } from "@/domain/career/types";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { WorkflowRun } from "@/domain/workflow/types";
import { buildDigest, checkedDigestSuggestions, type DigestInput } from "./build";
import { renderDigestEmail } from "@/server/digest/email";

const now = new Date("2026-10-08T02:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const ahead = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const base: DigestInput = { now, since: ago(24), dna: { ...EMPTY_DNA, updatedAt: ago(500) }, learnedSignals: [], answerMemory: [], jobs: {}, matches: {}, saved: {}, rejected: {}, runs: [], applications: [] };
const run = (p: Partial<WorkflowRun>) => ({ id: "r1", status: "COMPLETED", completedAt: ago(3), summary: { jobsDiscovered: 80, jobsRetained: 60, strongMatches: 4, applicationsPrepared: 0, actionsExecuted: 0, errors: 0, warnings: 0 }, ...p }) as unknown as WorkflowRun;
const job = { id: "j1", title: "IAM Director", company: "Acme" } as CanonicalJob;
const app = (p: Partial<Application>): Application => ({ id: "a1", jobId: "j1", status: "submitted", createdAt: ago(400), appliedAt: ago(400), artifacts: [], events: [], followUps: [], submissionKey: "k", ...p });

describe("buildDigest — only what happened, from the account's own data", () => {
  it("no activity means no digest", () => {
    expect(buildDigest(base).hasActivity).toBe(false);
  });

  it("reports activity, heads up, one CTA, dependencies, wins and fixes", () => {
    const d = buildDigest({
      ...base,
      runs: [run({}), run({ id: "r0", completedAt: ago(48) })],
      jobs: { j1: job, j2: { ...job, id: "j2" } },
      matches: { j2: { jobId: "j2", fit: "strong" } as JobMatch },
      saved: { j9: ago(2) },
      applications: [app({ followUps: [{ id: "f1", applicationId: "a1", kind: "interview", dueAt: ahead(30), note: "", done: false }] })],
    });
    expect(d.hasActivity).toBe(true);
    expect(d.keyDetails[0].text).toBe("1 search reviewed 60 jobs and found 4 strong matches."); // the older run is outside the period
    expect(d.headsUp[0].text).toMatch(/^Interview for IAM Director at Acme on /);
    expect(d.headsUp.map((h) => h.text)).toContain("1 strong match is waiting for you to decide.");
    expect(d.headsUp.find((h) => h.text.startsWith("1 strong match"))?.href).toBe("/app/jobs?fit=strong");
    expect(d.cta).toEqual({ label: "Prepare for your interview", href: "/app/applications/a1" });
    expect(d.dependencies.map((x) => x.text)).toEqual(expect.arrayContaining(["Add the role you want — searches need it."]));
    expect(d.goingWell[0].text).toBe("Wonder found 4 strong matches for you.");
    expect(d.subject).toMatch(/^Your WonderJobs digest: interview /);
    expect(d.facts.find((f) => f.key === "activity.strongFound")?.value).toBe("4");
  });

  it("flags searches with no strong match and quiet applications, with rule suggestions", () => {
    const d = buildDigest({ ...base, runs: [run({ summary: { jobsDiscovered: 50, jobsRetained: 40, strongMatches: 0 } as WorkflowRun["summary"] })], jobs: { j1: job }, applications: [app({ appliedAt: ago(24 * 20) })] });
    expect(d.needsImprovement.map((x) => x.text)).toEqual(["None of the 40 jobs reviewed was a strong match.", "1 application without a reply for over two weeks."]);
    expect(d.suggestions.every((s) => s.origin === "rules")).toBe(true);
    expect(d.suggestions.length).toBe(2);
  });
});

describe("AI suggestions and the email", () => {
  const d = buildDigest({ ...base, runs: [run({})] });
  it("keeps only AI suggestions that cite the digest's own facts", () => {
    const out = checkedDigestSuggestions([{ text: "Apply to two of your 4 strong matches today.", facts: ["activity.strongFound"] }, { text: "Network more on LinkedIn.", facts: ["made.up"] }], d);
    expect(out).toEqual([{ text: "Apply to two of your 4 strong matches today.", origin: "ai" }]);
  });
  it("renders escaped HTML with absolute links, an AI label and an unsubscribe link", () => {
    const mail = renderDigestEmail({ ...d, suggestions: [{ text: "Try <b>this</b>", origin: "ai" }] }, { origin: "https://jobs.example", name: "Asha", unsubscribeUrl: "https://jobs.example/api/digest/unsubscribe?u=x&s=y" });
    expect(mail.html).toContain("Try &lt;b&gt;this&lt;/b&gt;");
    expect(mail.html).toContain("Suggested by AI");
    expect(mail.html).toContain('href="https://jobs.example/app/jobs"');
    expect(mail.text).toContain("Stop these emails: https://jobs.example/api/digest/unsubscribe?u=x&s=y");
  });
});
