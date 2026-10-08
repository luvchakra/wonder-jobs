import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * APPLY-053 / EXT-010: the browser helper never submits a form programmatically or simulates a key press,
 * anywhere. It presses exactly two kinds of button, each in one place under its own gate: a page's own
 * next-page button after its step classifier calls it "next" (owner decision WJ-239), and the employer's
 * final button only under `plan.submit` — the candidate's "Submit applications" setting (owner decision
 * WJ-249) — after checking the page is complete and reporting APPLICATION_SUBMITTED first. This scans every
 * script the extension ships and runs the classifier itself.
 */
const ROOT = path.resolve(__dirname, "../../../../../extension");

function scripts(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return scripts(p);
    return p.endsWith(".js") ? [p] : [];
  });
}

describe("browser helper — structural no-submit guarantee", () => {
  const files = scripts(ROOT);
  it("ships scripts to scan", () => {
    expect(files.map((f) => path.relative(ROOT, f)).sort()).toEqual(expect.arrayContaining(["background.js", "content/autofill.js", "content/wonderjobs-bridge.js", "popup/popup.js"]));
  });
  for (const pattern of [/\.submit\(/, /requestSubmit/, /new\s+(KeyboardEvent|SubmitEvent|MouseEvent|PointerEvent)/, /dispatchEvent\(\s*new\s+Event\(\s*["'](submit|click)["']/, /\.form\s*\.\s*submit/]) {
    it(`no script contains ${pattern}`, () => {
      for (const f of files) expect(readFileSync(f, "utf8"), path.relative(ROOT, f)).not.toMatch(pattern);
    });
  }
  it("presses exactly two buttons, each in one place: next after the classifier says next; final only under plan.submit", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const presses = src.match(/\.click\(\s*\)/g) ?? [];
      if (!f.endsWith(path.join("content", "autofill.js"))) expect(presses, path.relative(ROOT, f)).toHaveLength(0);
      else {
        expect(presses).toHaveLength(2);
        expect(src).toMatch(/if \(stepKind\(label\) === "next"\) button\.click\(\);/);
        expect(src).toMatch(/if \(stepKind\(label\) === "final" && state\.submit\) button\.click\(\);/);
      }
    }
  });
  it("submits only from plan.submit, on a complete page, once, reporting before the press", () => {
    const src = readFileSync(path.join(ROOT, "content/autofill.js"), "utf8");
    // state.submit is only ever set from WonderJobs' plan.
    for (const m of src.matchAll(/state\.submit = ([^;]+);/g)) expect(m[1]).toMatch(/^(false|!IN_CLOUD && !!r\.data\.(plan\.)?submit)$/);
    // Never inside the cloud browser (a server-hosted page): submission is only in the candidate's own browser.
    expect(src).toMatch(/const IN_CLOUD = !!\(window\.chrome && window\.chrome\.runtime && window\.chrome\.runtime\.__wonder\);/);
    expect(src).toMatch(/if \(state\.submit && !waiting\.length && final\.length === 1 && pageComplete\(final\[0\]\)\) return submitFinal\(/);
    const fn = src.slice(src.indexOf("async function submitFinal("), src.indexOf("// Learning:"));
    expect(fn.indexOf("if (state.submitted) return;")).toBeGreaterThan(-1);
    expect(fn.indexOf('sendEvent({ type: "APPLICATION_SUBMITTED"')).toBeLessThan(fn.indexOf("button.click()"));
  });
  it("the step classifier never calls a submit, apply, send, finish or confirm button \"next\"", () => {
    const src = readFileSync(path.join(ROOT, "content/autofill.js"), "utf8");
    const block = src.slice(src.indexOf("/* step-classifier:start */"), src.indexOf("/* step-classifier:end */"));
    const stepKind = new Function(`${block}; return stepKind;`)() as (label: string) => "next" | "final" | null;
    for (const label of ["Next", "Continue", "Save and continue", "Save & Continue", "Next step", "Continue to review", "Proceed", "Next ›"]) expect(stepKind(label), label).toBe("next");
    for (const label of ["Submit", "Submit application", "Apply", "Apply now", "Send", "Send application", "Finish", "Complete", "Confirm", "Done", "Continue to submit", "Continue to apply", "Save and submit", "Pay now", "Sign and submit"]) expect(stepKind(label), label).toBe("final");
    for (const label of ["Back", "Cancel", "Upload", "Choose file", "Review application", "Save", "Clear", ""]) expect(stepKind(label), label).toBeNull();
  });
  it("the content script never reads a password, one-time-code or payment field's value", () => {
    const src = readFileSync(path.join(ROOT, "content/autofill.js"), "utf8");
    expect(src).toMatch(/if \(type === "password" \|\| type === "otp"\) continue;/);
    expect(src).toMatch(/if \(type === "password" \|\| type === "otp"\) return undefined; \/\/ never looked at/);
    expect(src).toMatch(/startsWith\("cc-"\)\) continue;/);
  });
  it("only the service worker holds tokens, and it only calls the JobsApply helper endpoints", () => {
    const bg = readFileSync(path.join(ROOT, "background.js"), "utf8");
    expect(bg).toMatch(/JOBSAPPLY_PATHS = \/\^\\\/api\\\/jobs-apply\\\/extension\\\/\(session\|inspect\|fill-plan\|events\|file\)/);
    const content = readFileSync(path.join(ROOT, "content/autofill.js"), "utf8");
    expect(content).not.toMatch(/authorization|Bearer/i);
  });
  it("the manifest asks only for narrow permissions (§46)", () => {
    const m = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    expect(m.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
    expect(m.host_permissions).not.toContain("<all_urls>");
    expect(m.host_permissions).not.toContain("https://*/*");
    expect(m.optional_host_permissions).toEqual(["https://*/*"]);
  });
});
