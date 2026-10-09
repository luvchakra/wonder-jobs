import { describe, expect, it } from "vitest";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { idMarker } from "@/domain/jobs-apply/sensitive";
import { writeClientState } from "@/server/clientState";
import { stateStore } from "@/server/state";
import { getSensitive, packSensitive, putSensitive, withIdNumbers } from "./sensitive";

const dna: CareerDNA = { ...EMPTY_DNA, name: "K", history: { contact: { location: "Mumbai, India" }, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] }, updatedAt: "2026-10-09T00:00:00Z" };
const automation = (t: string, over: Record<string, string>, level: string | null = "guided") => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), ...over }, ...(level ? { defaultLevel: level } : {}) } as never);

describe("sensitive answers on the server", () => {
  it("stores answers and ID numbers encrypted, and shows IDs only masked", async () => {
    await putSensitive("t-sen-1", { answers: { gender: "Male" }, ids: { pan: "ABCDE1234F" } });
    const raw = JSON.stringify((await stateStore.get("t-sen-1", "wj.sensitive"))?.state);
    expect(raw).not.toContain("ABCDE1234F");
    expect(raw).not.toContain("Male");
    expect(await getSensitive("t-sen-1")).toEqual({ answers: { gender: "Male" }, ids: { pan: "••••••234F" } });
    await putSensitive("t-sen-1", { ids: { pan: null } });
    expect((await getSensitive("t-sen-1")).ids).toEqual({});
    // Another tenant sees nothing.
    expect(await getSensitive("t-sen-other")).toEqual({ answers: {}, ids: {} });
  });

  it("carries only the groups the candidate turned on, and never the numbers", async () => {
    await putSensitive("t-sen-2", { answers: { gender: "Male" }, ids: { pan: "ABCDE1234F" } });
    await writeClientState("t-sen-2", "wj.career", 1, { dna } as never);
    expect(await packSensitive("t-sen-2")).toBeUndefined(); // nothing turned on
    await automation("t-sen-2", { fill_demographics: "automatic", fill_government_ids: "automatic" });
    const p = await packSensitive("t-sen-2");
    expect(p).toMatchObject({ allowed: ["fill_demographics", "fill_government_ids"], ids: ["pan"], homeCountry: "India" });
    expect(JSON.stringify(p)).not.toContain("ABCDE1234F");
  });

  it("fails closed: no saved level, or an unreadable store, allows nothing", async () => {
    await putSensitive("t-sen-3", { answers: { gender: "Male" } });
    await automation("t-sen-3", { fill_demographics: "automatic" }, null);
    expect(await packSensitive("t-sen-3")).toBeUndefined();
    const get = stateStore.get;
    stateStore.get = async () => {
      throw new Error("db down");
    };
    try {
      expect(await packSensitive("t-sen-2")).toBeUndefined();
    } finally {
      stateStore.get = get;
    }
  });

  it("swaps a marker for the number only in outgoing fills, and drops one with no number saved", async () => {
    await putSensitive("t-sen-4", { ids: { pan: "ABCDE1234F" } });
    const out = await withIdNumbers("t-sen-4", [{ fieldId: "a", value: idMarker("pan") }, { fieldId: "b", value: idMarker("passport") }, { fieldId: "c", value: "Mumbai" }]);
    expect(out).toEqual([{ fieldId: "a", value: "ABCDE1234F" }, { fieldId: "c", value: "Mumbai" }]);
  });
});
