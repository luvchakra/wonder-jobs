import { describe, expect, it } from "vitest";
import { FORM_WAIT_MS, formWait } from "./waiting";

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
