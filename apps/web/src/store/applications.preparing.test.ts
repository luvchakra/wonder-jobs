import { beforeEach, describe, expect, it } from "vitest";
import { useApplicationsStore } from "./applications";
import { useUIStore } from "./ui";

const appFor = (jobId: string) => Object.values(useApplicationsStore.getState().applications).find((a) => a.jobId === jobId);

describe("starting on a job puts it in Pipeline → Preparing", () => {
  beforeEach(() => useApplicationsStore.setState({ applications: {} }));

  it("creates the application as Preparing, or moves a Saved one there, with a timeline event", () => {
    const st = useApplicationsStore.getState();
    st.startPreparing("j1", "Opened Apply on the employer's site");
    expect(appFor("j1")).toMatchObject({ status: "preparing" });
    expect(appFor("j1")!.events.at(-1)!.title).toBe("Opened Apply on the employer's site");
    const saved = st.create("j2", "saved");
    st.startPreparing("j2", "Customized résumé made");
    expect(useApplicationsStore.getState().applications[saved.id].status).toBe("preparing");
  });

  it("never moves an application back", () => {
    const st = useApplicationsStore.getState();
    const a = st.create("j3", "saved");
    st.setStatus(a.id, "submitted");
    st.startPreparing("j3", "Opened Apply on the employer's site");
    expect(useApplicationsStore.getState().applications[a.id].status).toBe("submitted");
  });
});

describe("Pipeline's last-opened stage", () => {
  it("is kept between visits; anything unknown is ignored", () => {
    useUIStore.getState().setPipelineStage("interview");
    const opts = useUIStore.persist.getOptions();
    const saved = opts.partialize!(useUIStore.getState());
    expect(saved).toEqual({ pipelineStage: "interview" });
    const fresh = { ...useUIStore.getState(), pipelineStage: undefined };
    expect((opts.merge!(saved, fresh) as { pipelineStage?: string }).pipelineStage).toBe("interview");
    expect((opts.merge!({ pipelineStage: "nope" }, fresh) as { pipelineStage?: string }).pipelineStage).toBeUndefined();
  });
});
