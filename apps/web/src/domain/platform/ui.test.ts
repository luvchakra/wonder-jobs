import { describe, expect, it } from "vitest";
import { cleanUi, effectiveUi, UI_DEFAULT, UI_EARLY_APPLY, UI_PREVIEW_KEY, UI_STORED_KEY } from "./ui";

describe("the platform's UI choice", () => {
  it("is the first UI unless 2 was saved; anything unusable never changes the look", () => {
    expect(UI_DEFAULT).toBe(1);
    expect(cleanUi(undefined)).toEqual({ version: 1 });
    expect(cleanUi({ version: 2, updatedAt: "2026-11-28T10:00:00Z", updatedBy: "a@b.c" })).toEqual({ version: 2, updatedAt: "2026-11-28T10:00:00Z", updatedBy: "a@b.c" });
    for (const bad of [{ version: 3 }, { version: "2" }, { version: null }, "2", 2, []]) expect(cleanUi(bad).version).toBe(1);
  });

  it("shows a device its own preview when one is set, else the platform's choice", () => {
    expect(effectiveUi(2, null)).toBe(2);
    expect(effectiveUi("2", null)).toBe(2);
    expect(effectiveUi(2, "1")).toBe(1);
    expect(effectiveUi(1, "2")).toBe(2);
    expect(effectiveUi(null, null)).toBe(1);
    expect(effectiveUi("x", "y")).toBe(1);
  });

  it("applies the remembered look before paint, and never throws without storage", () => {
    const run = (store: Record<string, string> | null) => {
      const attrs: Record<string, string> = {};
      const localStorage = store ? { getItem: (k: string) => store[k] ?? null } : { getItem: () => { throw new Error("blocked"); } };
      const document = { documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) } };
      new Function("localStorage", "document", UI_EARLY_APPLY)(localStorage, document);
      return attrs["data-ui"];
    };
    expect(run({})).toBeUndefined();
    expect(run({ [UI_STORED_KEY]: "2" })).toBe("2");
    expect(run({ [UI_STORED_KEY]: "2", [UI_PREVIEW_KEY]: "1" })).toBeUndefined();
    expect(run({ [UI_STORED_KEY]: "1", [UI_PREVIEW_KEY]: "2" })).toBe("2");
    expect(run(null)).toBeUndefined();
  });
});
