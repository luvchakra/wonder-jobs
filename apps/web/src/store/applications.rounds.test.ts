import { beforeEach, describe, expect, it } from "vitest";
import { useApplicationsStore } from "./applications";

describe("setInterviewRounds", () => {
  beforeEach(() => useApplicationsStore.setState({ applications: {} }));
  it("counts rounds within 0–20 and notes each added round on the timeline", () => {
    const a = useApplicationsStore.getState().create("job-r", "interview");
    const s = useApplicationsStore.getState();
    s.setInterviewRounds(a.id, 1);
    s.setInterviewRounds(a.id, 2);
    s.setInterviewRounds(a.id, 1);
    s.setInterviewRounds(a.id, -3);
    const got = useApplicationsStore.getState().applications[a.id];
    expect(got.interviewRounds).toBe(0);
    expect(got.events.filter((e) => e.title.startsWith("Interview round")).map((e) => e.title)).toEqual(["Interview round 1 done", "Interview round 2 done"]);
    useApplicationsStore.getState().setInterviewRounds(a.id, 99);
    expect(useApplicationsStore.getState().applications[a.id].interviewRounds).toBe(20);
  });
});
