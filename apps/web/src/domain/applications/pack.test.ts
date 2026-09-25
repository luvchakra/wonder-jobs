import { describe, expect, it } from "vitest";
import { describeApplicationPack } from "./pack";
import type { Application, ApplicationArtifact, ArtifactType, ArtifactVersion } from "./types";

function artifact(type: ArtifactType, ...provenance: ArtifactVersion["provenance"][]): ApplicationArtifact {
  const versions = provenance.map((p, i) => ({ id: `${type}-${i}`, createdAt: "2026-09-01T00:00:00Z", provenance: p, content: "text" }));
  return { id: type, applicationId: "a1", type, versions, currentVersionId: versions[versions.length - 1].id };
}

function app(artifacts: ApplicationArtifact[]): Application {
  return { id: "a1", jobId: "j1", status: "preparing", createdAt: "2026-09-01T00:00:00Z", artifacts, events: [], followUps: [], submissionKey: "submit:j1:me" };
}

describe("describeApplicationPack", () => {
  it("says nothing is prepared when no artifact exists", () => {
    const s = describeApplicationPack(app([]));
    expect(s.title).toBe("Nothing prepared yet");
    expect(s.ready).toBe(false);
    expect(s.items.every((i) => !i.ready && !i.source)).toBe(true);
  });

  it("counts only materials that actually exist", () => {
    const s = describeApplicationPack(app([artifact("resume", "AI_GENERATED")]));
    expect(s.title).toBe("1 of 3 materials ready");
    expect(s.items.find((i) => i.type === "resume")).toMatchObject({ ready: true, source: "AI-generated draft" });
    expect(s.items.find((i) => i.type === "cover_letter")?.ready).toBe(false);
  });

  it("is ready only when every material exists, and reports who wrote the current version", () => {
    const resume = artifact("resume", "AI_GENERATED", "USER_MODIFIED");
    const s = describeApplicationPack(app([resume, artifact("cover_letter", "USER_PROVIDED"), artifact("answers", "AI_GENERATED")]));
    expect(s.title).toBe("Application ready");
    expect(s.ready).toBe(true);
    expect(s.items.map((i) => i.source)).toEqual(["Edited by you", "Written by you", "AI-generated draft"]);
  });

  it("follows the restored version, not the newest one", () => {
    const resume = artifact("resume", "AI_GENERATED", "USER_MODIFIED");
    resume.currentVersionId = resume.versions[0].id;
    expect(describeApplicationPack(app([resume])).items[0].source).toBe("AI-generated draft");
  });
});
