import { describe, expect, it } from "vitest";
import { sourceNeed } from "./setup";
import type { SourceView } from "./views";

const base = { id: "evt_ticketmaster", name: "Ticketmaster", status: "active", available: false, credential: null, statusReason: undefined } as unknown as SourceView;

describe("Setup to-do — what each source still needs", () => {
  it("sends a missing platform key to API keys, and other credentials to Source credentials", () => {
    expect(sourceNeed({ ...base, credential: { ref: "env:TICKETMASTER_API_KEY", masked: "Not set (TICKETMASTER_API_KEY)", managedBy: "environment", present: false } } as SourceView)).toMatchObject({ need: "key", detail: "Needs TICKETMASTER_API_KEY", action: { href: "/platform/jobs-lake/keys" } });
    expect(sourceNeed({ ...base, credential: { ref: "env:THEIRSTACK", masked: "Not set (THEIRSTACK_API_KEYS or THEIRSTACK_API_KEY)", managedBy: "environment", present: false } } as SourceView)?.action.href).toBe("/platform/jobs-lake/credentials");
  });
  it("lists paused sources with terms pending, and leaves ready, disabled and do-not-use sources out", () => {
    expect(sourceNeed({ ...base, status: "paused", statusReason: "Terms pending: no licence stated" } as SourceView)).toMatchObject({ need: "terms" });
    expect(sourceNeed({ ...base, available: true })).toBeNull();
    expect(sourceNeed({ ...base, status: "disabled" } as SourceView)).toBeNull();
    expect(sourceNeed({ ...base, status: "do_not_use" } as SourceView)).toBeNull();
    expect(sourceNeed({ ...base, status: "paused", statusReason: "Paused by an admin" } as SourceView)).toBeNull();
    // Live while its terms are confirmed (CLAUDE.md): still on the list, marked live.
    expect(sourceNeed({ ...base, available: true, statusReason: "terms pending: Devpost's reuse terms" } as SourceView)).toMatchObject({ need: "terms", detail: "Live · terms pending: Devpost's reuse terms" });
  });
});
