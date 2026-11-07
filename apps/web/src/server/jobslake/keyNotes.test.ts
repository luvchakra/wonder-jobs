import { describe, expect, it } from "vitest";
import { cleanKeyNote, readKeyNotes, setKeyNote, MAX_TAGS } from "./keyNotes";

describe("key notes", () => {
  it("cleans tags (lower case, unique, capped), the note and the reminder date", () => {
    expect(cleanKeyNote({ tags: [" Waiting  Approval ", "waiting approval", "", 5, "Paid"], note: "  asked on 7 Nov ", remindOn: "2026-11-14" })).toEqual({ tags: ["waiting approval", "paid"], note: "asked on 7 Nov", remindOn: "2026-11-14" });
    expect(cleanKeyNote({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) })!.tags).toHaveLength(MAX_TAGS);
    expect(cleanKeyNote({ remindOn: "next week" })).toBeNull();
    expect(cleanKeyNote({ tags: [], note: "  " })).toBeNull();
  });

  it("saves, replaces and clears a note on a known key only, with who and when", async () => {
    expect(await setKeyNote("NOT_A_KEY", { note: "x" }, "a@x")).toEqual({ ok: false, message: "No such key." });
    const r = await setKeyNote("RELIEFWEB_APPNAME", { tags: ["waiting approval"], note: "Form sent", remindOn: "2026-11-14" }, "a@x", new Date("2026-11-07T10:00:00Z"));
    expect(r).toMatchObject({ ok: true, note: { tags: ["waiting approval"], note: "Form sent", remindOn: "2026-11-14", by: "a@x", at: "2026-11-07T10:00:00.000Z" } });
    expect((await readKeyNotes()).RELIEFWEB_APPNAME?.note).toBe("Form sent");
    await setKeyNote("RELIEFWEB_APPNAME", { tags: [], note: "" }, "a@x");
    expect((await readKeyNotes()).RELIEFWEB_APPNAME).toBeUndefined();
  });
});
