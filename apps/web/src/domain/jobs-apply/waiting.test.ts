import { describe, expect, it } from "vitest";
import { FORM_WAIT_MS, formWait, pickOnPortal } from "./waiting";

const at = Date.parse("2026-10-09T10:00:00Z");
const s = (over: Record<string, unknown> = {}) => ({ status: "OPENING", stopped: false, updatedAt: "2026-10-09T10:00:00Z", ...over }) as never;

describe("waiting for the application form, not forever", () => {
  it("waits, then says the form hasn't appeared", () => {
    expect(formWait(s(), at + 30_000)).toBe("waiting");
    expect(formWait(s(), at + FORM_WAIT_MS)).toBe("timed_out");
  });
  it("starts over when the candidate keeps waiting, and doesn't wait once there's a form or it stopped", () => {
    expect(formWait(s(), at + FORM_WAIT_MS + 10_000, at + FORM_WAIT_MS)).toBe("waiting");
    expect(formWait(s({ form: { fieldCount: 3 } }), at + 10 * FORM_WAIT_MS)).toBe("not_waiting");
    expect(formWait(s({ stopped: true }), at + 10 * FORM_WAIT_MS)).toBe("not_waiting");
    expect(formWait(s({ status: "FILLING" }), at + 10 * FORM_WAIT_MS)).toBe("not_waiting");
  });
});

describe("pickOnPortal (WJ-312)", () => {
  const item = (fieldId: string, required: boolean, status: "open" | "resolved" = "open") => ({ id: `i_${fieldId}`, fieldId, required, status }) as never;
  it("lists required, open questions that are dropdowns without readable options", () => {
    const formFields = [
      { id: "visa", label: "Sponsorship?", type: "combobox", required: true },
      { id: "country", label: "Country", type: "combobox", required: true, options: [{ label: "India", value: "IN" }] },
      { id: "gender", label: "Gender", type: "combobox", required: false },
      { id: "why", label: "Why us?", type: "textarea", required: true },
    ] as never;
    const got = pickOnPortal({ formFields, interventions: [item("visa", true), item("country", true), item("gender", false), item("why", true)] });
    expect(got.map((i) => i.fieldId)).toEqual(["visa"]);
    expect(pickOnPortal({ formFields, interventions: [item("visa", true, "resolved")] })).toEqual([]);
  });
});
