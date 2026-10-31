import { describe, expect, it } from "vitest";
import { liveModule, useUIStore } from "./ui";

describe("the active WonderWorks module", () => {
  it("only a live module comes back from storage", () => {
    expect(liveModule("internships")).toBe("internships");
    expect(liveModule("events")).toBe("events");
    expect(liveModule("jobs")).toBe("jobs");
    expect(liveModule("marketplace")).toBeUndefined();
    expect(liveModule("nope")).toBeUndefined();
    expect(liveModule(42)).toBeUndefined();
  });

  it("is kept with the account's UI state, and Jobs (the default) isn't written", () => {
    const opts = useUIStore.persist.getOptions();
    useUIStore.getState().setActiveModule("internships");
    expect(opts.partialize!(useUIStore.getState())).toMatchObject({ activeModule: "internships" });
    useUIStore.getState().setActiveModule("jobs");
    expect(opts.partialize!(useUIStore.getState())).not.toHaveProperty("activeModule");
    const merged = opts.merge!({ activeModule: "marketplace" }, useUIStore.getState()) as { activeModule?: string };
    expect(merged.activeModule).toBe("jobs");
  });
});
