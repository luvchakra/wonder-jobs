import { describe, expect, it, beforeEach } from "vitest";
import { toast, useToasts } from "./Toast";

describe("toast — one push per call, each with the right human-facing tone", () => {
  beforeEach(() => {
    useToasts.setState({ toasts: [] });
  });

  it("pushes a warning toast with the warning tone, distinct from info and error", () => {
    toast.warning("No search term set", "Click Save again to continue.");
    const t = useToasts.getState().toasts.at(-1);
    expect(t?.tone).toBe("warning");
    expect(t?.title).toBe("No search term set");
  });

  it("keeps success, info and error on their own tones", () => {
    toast.success("Done");
    toast.info("FYI");
    toast.error("Oops");
    const tones = useToasts.getState().toasts.map((t) => t.tone);
    expect(tones).toEqual(["success", "info", "error"]);
  });
});
