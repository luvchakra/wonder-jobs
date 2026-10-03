import { describe, expect, it } from "vitest";
import type { UploadedResume } from "@/domain/resume/files";
import type { SavedResume } from "@/domain/resume/saved";
import { studioTab } from "@/lib/resumeStudio";
import { resumeOptionsFor } from "./resumeOptions";

const saved = (id: string, jobId?: string): SavedResume => ({
  id,
  templateId: "executive-v1",
  templateVersion: "1.0.0",
  createdAt: "2026-10-01T00:00:00.000Z",
  pageCount: 1,
  document: {} as SavedResume["document"],
  target: jobId ? { jobId, title: "PM", company: "Example" } : undefined,
});
const upload = (id: string, filename = `${id}.pdf`): UploadedResume => ({ id, filename, mime: "application/pdf", sizeBytes: 1000, sha256: "0".repeat(64), uploadedAt: "2026-10-02T00:00:00.000Z" });

describe("résumé options when applying", () => {
  it("without uploads or a base, behaves as before: this job's résumé, other saved ones, then the tailored draft", () => {
    const o = resumeOptionsFor({ jobId: "j1", hasTailored: true, saved: [saved("s_other"), saved("s_job", "j1")] });
    expect(o.map((x) => x.key)).toEqual(["saved:s_job", "saved:s_other", "tailored"]);
  });

  it("offers the base résumé first when nothing was made for this job — an uploaded one is attached as the candidate's own file", () => {
    const o = resumeOptionsFor({ jobId: "j1", hasTailored: true, saved: [saved("s1")], uploads: [upload("rf_a"), upload("rf_base", "Priya CV.pdf")], base: { kind: "upload", id: "rf_base" } });
    expect(o.map((x) => x.key)).toEqual(["upload:rf_base", "upload:rf_a", "saved:s1", "tailored"]);
    expect(o[0]).toMatchObject({ kind: "upload", label: "Your base résumé — Priya CV.pdf", upload: { id: "rf_base" } });
    expect(o[0].detail).toContain("attached exactly as uploaded");
  });

  it("a résumé made for this job still comes before the base", () => {
    const o = resumeOptionsFor({ jobId: "j1", hasTailored: false, saved: [saved("s_job", "j1"), saved("s_base")], uploads: [upload("rf_a")], base: { kind: "saved", id: "s_base" } });
    expect(o.map((x) => x.key)).toEqual(["saved:s_job", "saved:s_base", "upload:rf_a"]);
    expect(o[1].label).toMatch(/^Your base résumé/);
  });

  it("never picks a base the candidate didn't mark, and ignores a base that no longer exists", () => {
    const none = resumeOptionsFor({ jobId: "j1", hasTailored: false, saved: [], uploads: [upload("rf_a"), upload("rf_b")] });
    expect(none.every((x) => !x.label.startsWith("Your base"))).toBe(true);
    const gone = resumeOptionsFor({ jobId: "j1", hasTailored: false, saved: [saved("s1")], uploads: [upload("rf_a")], base: { kind: "upload", id: "rf_deleted" } });
    expect(gone.map((x) => x.key)).toEqual(["upload:rf_a", "saved:s1"]);
    expect(gone.every((x) => !x.label.startsWith("Your base"))).toBe(true);
  });

  it("lists the base once, even when it is also among the other saved résumés", () => {
    const o = resumeOptionsFor({ jobId: "j1", hasTailored: false, saved: [saved("s1"), saved("s2")], base: { kind: "saved", id: "s2" } });
    expect(o.map((x) => x.key)).toEqual(["saved:s2", "saved:s1"]);
  });
});

describe("Resume Studio tab", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("opens on My resumes; Templates by ?tab=templates or when preparing a résumé for a job", () => {
    expect(studioTab(q(""))).toBe("mine");
    expect(studioTab(q("tab=mine"))).toBe("mine");
    expect(studioTab(q("tab=templates"))).toBe("templates");
    expect(studioTab(q("job=j1&app=a1"))).toBe("templates");
    expect(studioTab(q("job=j1&tab=mine"))).toBe("mine");
    expect(studioTab(q("tab=nonsense"))).toBe("mine");
  });
});
