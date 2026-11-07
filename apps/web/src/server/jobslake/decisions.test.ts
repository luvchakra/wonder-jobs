import { describe, expect, it } from "vitest";
import { DECISION_ANSWERS, decisionAnswers, decisionsDone, OWNER_DECISIONS, setDecision } from "./decisions";
import { openLabel } from "./importView";
import { MODULES } from "@/modules/registry";

describe("owner decisions on Sources → Import", () => {
  it("are unique, name a real module (or all), and say what to decide", () => {
    const ids = OWNER_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of OWNER_DECISIONS) {
      expect(d.module === "all" || MODULES.some((m) => m.id === d.module)).toBe(true);
      expect(d.detail.length).toBeGreaterThan(20);
      for (const g of d.geography ?? []) expect(g).toMatch(/^([A-Z]{2}|global|remote)$/);
    }
  });

  it("give every decision its own answer buttons, each with a hint, and never the old \"Mark decided\"", () => {
    for (const d of OWNER_DECISIONS) {
      const answers = DECISION_ANSWERS[d.id];
      expect(answers, d.id).toBeDefined();
      expect(answers.length).toBeGreaterThanOrEqual(1);
      expect(answers.length).toBeLessThanOrEqual(2);
      for (const a of answers) {
        expect(a.label).not.toMatch(/mark decided/i);
        expect(a.label.length).toBeLessThanOrEqual(28);
        expect(a.hint.length).toBeGreaterThan(10);
      }
    }
    // No answers for ids that aren't decisions any more.
    for (const id of Object.keys(DECISION_ANSWERS)) expect(OWNER_DECISIONS.some((d) => d.id === id), id).toBe(true);
    expect(decisionAnswers("not-listed-yet")).toEqual([{ label: "Done", hint: expect.any(String) }]);
  });

  it("names where a decision's link goes", () => {
    expect(openLabel("https://github.com/luvchakra/wonder-jobs/settings/secrets/actions")).toBe("Open github.com ↗");
    expect(openLabel("/platform/jobs-lake/keys")).toBe("Open Keys");
  });

  it("marks one done and back, refuses unknown ids, and keeps who and when", async () => {
    const id = OWNER_DECISIONS[0].id;
    expect(await setDecision("nope", true, "admin@x")).toBe(false);
    // A live source's terms, confirmed on the Import page.
    expect(await setDecision("terms:workingnomads", true, "admin@x")).toBe(true);
    expect(await setDecision("terms:bad id!", true, "admin@x")).toBe(false);
    expect(await setDecision(id, true, "admin@x", " chose self-hosted ", new Date("2026-11-01T10:00:00Z"))).toBe(true);
    expect((await decisionsDone())[id]).toEqual({ at: "2026-11-01T10:00:00.000Z", by: "admin@x", note: "chose self-hosted" });
    await setDecision(id, false, "admin@x");
    expect(id in (await decisionsDone())).toBe(false);
  });
});

describe("Sources → Import links", () => {
  it("every in-app link opens a page that exists (a decision once linked to /platform/data, which doesn't)", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const LAKE = "/platform/jobs-lake";
    const setupLinks = ["keys", "import"].map((p) => `${LAKE}/${p}`);
    const internal = [...OWNER_DECISIONS.map((d) => d.href).filter((h): h is string => !!h && h.startsWith("/")), ...setupLinks];
    for (const href of internal) expect(existsSync(join(process.cwd(), "src/app", href, "page.tsx")), href).toBe(true);
  });
});
