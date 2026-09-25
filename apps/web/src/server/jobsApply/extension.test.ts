import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * APPLY-053 / EXT-010: the browser helper has no way to submit an application. Not "doesn't by
 * default" — there is no code that clicks, submits a form, or simulates a key press, so no policy,
 * setting or page could make it. This scans every script the extension ships.
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
  for (const pattern of [/\.click\(\s*\)/, /\.submit\(/, /requestSubmit/, /new\s+(KeyboardEvent|SubmitEvent|MouseEvent|PointerEvent)/, /dispatchEvent\(\s*new\s+Event\(\s*["'](submit|click)["']/, /\.form\s*\.\s*submit/]) {
    it(`no script contains ${pattern}`, () => {
      for (const f of files) expect(readFileSync(f, "utf8"), path.relative(ROOT, f)).not.toMatch(pattern);
    });
  }
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
