import { describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { classifyField } from "./classify";
import { mapForm } from "./mapper";
import { buildApplicationProfile, educationFacts, experienceFacts } from "./profile";
import { idMarker, sensitiveAnswer, sensitiveKindOf, type PackSensitive } from "./sensitive";
import type { ApplicationField, ApplicationPackSnapshot } from "./types";

const T = Date.parse("2026-10-09T10:00:00Z");
const dna: CareerDNA = { ...EMPTY_DNA, name: "K", history: { contact: { email: "k@example.com", location: "Mumbai, India" }, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] }, updatedAt: "2026-10-09T10:00:00Z" };
const saved: PackSensitive = {
  allowed: ["fill_demographics", "fill_work_authorization", "fill_declarations", "fill_government_ids"],
  answers: { gender: "Male", ethnicity: "Prefer not to say", authorizedCountries: ["India"], criminalRecord: "No", agreeDeclarations: true },
  ids: ["pan"],
  homeCountry: "India",
};
const pack = (sensitive?: PackSensitive): ApplicationPackSnapshot => ({ applicationId: "a", jobId: "j", jobTitle: "Director", company: "Example", profile: buildApplicationProfile(dna, { now: T }), memory: [], answers: [], education: educationFacts(dna), experience: experienceFacts(dna), version: "pv", capturedAt: "2026-10-09T10:00:00Z", sensitive });
let n = 0;
const f = (label: string, over: Partial<ApplicationField> = {}): ApplicationField => ({ id: `s${++n}`, label, type: "text", required: true, step: 1, ...over });
const opts = (...labels: string[]) => labels.map((l, i) => ({ label: l, value: `v${i}` }));
const map = (fields: ApplicationField[], s?: PackSensitive) => mapForm({ fields }, pack(s), {}, T).mappings;

describe("sensitive questions — recognised, never guessed", () => {
  it("recognises each kind of sensitive question", () => {
    expect(sensitiveKindOf("Gender")?.key).toBe("gender");
    expect(sensitiveKindOf("Sexual orientation")).toBeUndefined();
    expect(sensitiveKindOf("Are you legally authorized to work in the United States?")?.key).toBe("authorized");
    expect(sensitiveKindOf("Will you now or in the future require visa sponsorship?")?.key).toBe("sponsorship");
    expect(sensitiveKindOf("Have you ever been convicted of a felony?")?.key).toBe("criminalRecord");
    expect(sensitiveKindOf("I agree to the privacy policy")?.key).toBe("agree");
    expect(sensitiveKindOf("Signature — I agree")).toBeUndefined();
    expect(sensitiveKindOf("PAN card number")?.key).toBe("pan");
    expect(sensitiveKindOf("Passport expiry date")).toBeUndefined();
  });

  it("answers only from what the candidate saved, by the country the question names", () => {
    expect(sensitiveAnswer({ group: "fill_work_authorization", key: "authorized" }, "Authorized to work in India?", saved, "radio")).toBe("Yes");
    expect(sensitiveAnswer({ group: "fill_work_authorization", key: "authorized" }, "Authorized to work in the United States?", saved, "radio")).toBe("No");
    expect(sensitiveAnswer({ group: "fill_work_authorization", key: "sponsorship" }, "Will you require sponsorship?", saved, "radio")).toBe("No");
    expect(sensitiveAnswer({ group: "fill_demographics", key: "veteran" }, "Veteran status", saved, "select")).toBeUndefined();
    expect(sensitiveAnswer({ group: "fill_declarations", key: "agree" }, "I agree", saved, "checkbox")).toBe("checked");
    expect(sensitiveAnswer({ group: "fill_government_ids", key: "pan" }, "PAN", saved, "text")).toBe(idMarker("pan"));
    expect(sensitiveAnswer({ group: "fill_government_ids", key: "passport" }, "Passport number", saved, "text")).toBeUndefined();
  });

  it("leaves every sensitive question to the candidate unless that group is turned on", () => {
    expect(classifyField(f("Gender", { type: "select", options: opts("Male", "Female") })).classification).not.toBe("safe");
    expect(classifyField(f("Gender", { type: "select", options: opts("Male", "Female") }), { sensitive: ["fill_work_authorization"] }).target).not.toMatchObject({ kind: "sensitive" });
    expect(classifyField(f("Gender", { type: "select", options: opts("Male", "Female") }), { sensitive: ["fill_demographics"] })).toMatchObject({ classification: "safe", target: { kind: "sensitive", key: "gender" } });
    const off = map([f("Gender", { type: "select", options: opts("Male", "Female") }), f("PAN number")]);
    expect(off.every((m) => m.value === undefined)).toBe(true);
  });

  it("fills a turned-on group with the saved answers, the ID only as a marker", () => {
    const m = map(
      [
        f("Gender", { type: "select", options: opts("Female", "Male", "Decline to self-identify") }),
        f("Race / ethnicity", { type: "select", options: opts("Asian", "White", "Decline to self-identify") }),
        f("Do you require visa sponsorship?", { type: "radio", options: opts("Yes", "No") }),
        f("I consent to the privacy notice", { type: "checkbox" }),
        f("PAN number"),
        f("Veteran status", { type: "select", options: opts("Yes", "No") }),
      ],
      saved,
    );
    expect(m.map((x) => x.value)).toEqual(["v1", "v2", "v1", "checked", idMarker("pan"), undefined]);
    expect(m[5]).toMatchObject({ status: "needs_you", reason: expect.stringMatching(/Sensitive questions/) });
  });
});
