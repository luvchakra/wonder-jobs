import { describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { readClientState, writeClientState } from "@/server/clientState";
import type { RememberedAnswer } from "@/domain/jobs-apply/types";
import { rememberAnswers } from "./remember";

const dna: CareerDNA = { ...EMPTY_DNA, name: "K", history: { contact: { phone: "+91 90000 00000", location: "Mumbai, India" }, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] }, updatedAt: "2026-10-01T00:00:00Z" };
const now = new Date("2026-10-09T09:00:00Z");
const read = async (t: string) => (await readClientState<{ dna: CareerDNA; answerMemory?: RememberedAnswer[]; onboarded?: boolean }>(t, "wj.career"))!;

describe("remembering what the candidate typed", () => {
  it("files contact facts in the profile, known answers in saved answers, anything else under its own wording", async () => {
    await writeClientState("t-rem-1", "wj.career", 1, { dna, onboarded: true, answerMemory: [] } as never);
    const r = await rememberAnswers(
      "t-rem-1",
      [
        { label: "Address Line 1*", type: "text", value: "12 Hill Road, Bandra" },
        { label: "Postal Code", type: "text", value: "400050" },
        { label: "Notice period", type: "select", value: "60 days" },
        { label: "How did you hear about us?", type: "select", value: "LinkedIn" },
      ],
      now,
    );
    expect(r.saved.map((s) => s.where)).toEqual(["profile", "profile", "answers", "answers"]);
    const doc = await read("t-rem-1");
    expect(doc.dna.history!.contact).toMatchObject({ addressLine1: "12 Hill Road, Bandra", postalCode: "400050", phone: "+91 90000 00000", location: "Mumbai, India" });
    expect(doc.answerMemory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "noticePeriod", value: "60 days", confirmedAt: now.toISOString() }),
        expect.objectContaining({ key: "custom", question: "How did you hear about us?", value: "LinkedIn" }),
      ]),
    );
    // Other parts of the document are left as they were.
    expect(doc.onboarded).toBe(true);
  });

  it("never saves sensitive answers or anything shaped like a card number", async () => {
    await writeClientState("t-rem-2", "wj.career", 1, { dna, answerMemory: [] } as never);
    const r = await rememberAnswers(
      "t-rem-2",
      [
        { label: "Gender", type: "select", value: "Male" },
        { label: "Are you legally authorized to work in India?", type: "radio", value: "Yes" },
        { label: "Will you require visa sponsorship?", type: "radio", value: "No" },
        { label: "Passport number", type: "text", value: "Z1234567" },
        { label: "Reference code", type: "text", value: "4111 1111 1111 1111" },
      ],
      now,
    );
    expect(r.saved).toEqual([]);
    expect(r.skipped).toHaveLength(5);
    expect((await read("t-rem-2")).answerMemory).toEqual([]);
  });

  it("replaces an older answer to the same question, and keeps the profile's own phone", async () => {
    await writeClientState("t-rem-3", "wj.career", 1, { dna, answerMemory: [{ key: "custom", question: "How did you hear about us?", value: "Referral", confirmedAt: "2026-09-01T00:00:00Z", source: "USER_PROVIDED" }] } as never);
    await rememberAnswers("t-rem-3", [{ label: "How did you hear about us?*", type: "text", value: "LinkedIn" }, { label: "Phone Number", type: "phone", value: "6307318656" }], now);
    const doc = await read("t-rem-3");
    expect(doc.answerMemory!.filter((m) => m.key === "custom")).toEqual([expect.objectContaining({ value: "LinkedIn" })]);
    expect(doc.dna.history!.contact.phone).toBe("+91 90000 00000");
  });

  it("writes only to the asking candidate's profile", async () => {
    await writeClientState("t-rem-4", "wj.career", 1, { dna, answerMemory: [] } as never);
    await rememberAnswers("t-rem-5", [{ label: "Postal Code", type: "text", value: "400050" }], now);
    expect((await read("t-rem-4")).dna.history!.contact.postalCode).toBeUndefined();
  });
});
