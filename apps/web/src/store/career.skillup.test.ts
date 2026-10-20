import { beforeEach, describe, expect, it } from "vitest";
import { useCareerStore } from "./career";

describe("My Saved Skills", () => {
  beforeEach(() => useCareerStore.setState({ skillUpSaved: [], skillUpHidden: [] }));

  it("saves a skill once, however it's written, starting Not started", () => {
    const s = useCareerStore.getState();
    s.saveSkillUp("Kafka", "skill");
    s.saveSkillUp(" kafka ", "skill");
    expect(useCareerStore.getState().skillUpSaved).toEqual([expect.objectContaining({ name: "Kafka", kind: "skill", level: 0 })]);
  });

  it("tracks the candidate's own progress and forgets an item they stop tracking", () => {
    const s = useCareerStore.getState();
    s.saveSkillUp("PMP", "certification");
    s.setSkillUpLevel("pmp", 3);
    expect(useCareerStore.getState().skillUpSaved[0].level).toBe(3);
    s.unsaveSkillUp("PMP");
    expect(useCareerStore.getState().skillUpSaved).toEqual([]);
  });

  it("keeps the list to fifty", () => {
    const s = useCareerStore.getState();
    for (let i = 0; i < 55; i++) s.saveSkillUp(`Skill ${i}`, "skill");
    expect(useCareerStore.getState().skillUpSaved).toHaveLength(50);
  });

  it("removes and restores suggestions", () => {
    const s = useCareerStore.getState();
    s.hideSkillUp("Risk");
    s.hideSkillUp("risk");
    expect(useCareerStore.getState().skillUpHidden).toEqual(["risk"]);
    s.restoreSkillUp();
    expect(useCareerStore.getState().skillUpHidden).toEqual([]);
  });
});
