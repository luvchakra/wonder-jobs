import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowedHelperPath, hostMatches } from "./appClient.js";
import { serviceAuthorized, signStreamToken, verifyStreamToken } from "./auth.js";
import { readConfig } from "./config.js";
import { pageScript, SHIM } from "./helperScript.js";
import { KEYS, parseInput } from "./input.js";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const SECRET = "x".repeat(40);

describe("the worker never acts on the page by itself", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("only input.ts (what the candidate sent) and picker.ts (a dropdown the helper asked about) drive the page", () => {
    const acts = /\.(click|dblclick|press|tap|fill|type|check|selectOption|setInputFiles|submit|focus)\(|\bkeyboard\.|\bmouse\.|dispatchEvent\(/;
    for (const f of files) {
      const src = readFileSync(path.join(SRC, f), "utf8");
      if (f === "input.ts") expect(src).toMatch(/relayInput/);
      else if (f !== "picker.ts") expect(src, f).not.toMatch(acts);
    }
    // And input.ts relays exactly the four candidate gestures — no scripted sequence, no submit.
    const input = readFileSync(path.join(SRC, "input.ts"), "utf8");
    expect(input).not.toMatch(/submit|\.evaluate\(|setInputFiles/);
    expect([...KEYS]).not.toContain("F5");
  });

  it("picker.ts opens one dropdown with ArrowDown, closes it with Escape, and clicks only the option that is the answer (WJ-312)", () => {
    const src = readFileSync(path.join(SRC, "picker.ts"), "utf8");
    // Keys: exactly ArrowDown and Escape, on the marked combobox's own text box.
    expect([...src.matchAll(/\.press\(([^)]*)\)/g)].map((m) => m[1])).toEqual(['"ArrowDown"', '"Escape"']);
    expect(src).toMatch(/el\.tagName === "INPUT" && el\.getAttribute\("role"\) === "combobox"/);
    // One click, on the single option marked because its text equals the answer.
    expect([...src.matchAll(/\.click\(/g)]).toHaveLength(1);
    expect(src).toMatch(/await frame\.locator\(`\[\$\{CHOSEN\}="1"\]`\)\.click\(\{ timeout: 3000 \}\);/);
    expect(src).toMatch(/if \(hit\.length !== 1\) return false;/);
    expect(src).toMatch(/if \(opts\.filter\(\(o\) => norm\(o\) === want\)\.length !== 1\) \{/);
    // Nothing typed, no Enter or Tab, no other gesture.
    expect(src).not.toMatch(/\.(fill|type|dblclick|tap|check|selectOption|setInputFiles|submit|dispatchEvent)\(|keyboard\.|mouse\.|"Enter"|"Tab"/);
    // The session asks the picker only for frames on the application's own site.
    const session = readFileSync(path.join(SRC, "session.ts"), "utf8");
    expect(session).toMatch(/if \(\(m\.type === "comboOptions" \|\| m\.type === "comboPick"\) && frame && this\.onDestination\(frame\.url\(\)\)\) \{/);
  });

  it("runs the extension's own helper script behind a message shim", () => {
    const script = pageScript();
    expect(script.startsWith(SHIM)).toBe(true);
    expect(script).toContain("window.__wonderjobsHelper");
    // In the cloud the helper submits only when WonderJobs' plan says so for a background fill the candidate
    // asked to submit (WJ-311); the extension's own unit test holds the rest of that gate.
    expect(script).toContain("state.submit = (!IN_CLOUD || !!r.data.plan.cloudSubmit) && !!r.data.plan.submit;");
  });
});

describe("stream tokens and service calls", () => {
  it("round-trips, expires, and rejects tampering or another secret", () => {
    const t = signStreamToken({ cloudId: "c1", tenantId: "t1", exp: 2_000 }, SECRET);
    expect(verifyStreamToken(t, SECRET, 1_000)).toEqual({ cloudId: "c1", tenantId: "t1", exp: 2_000 });
    expect(verifyStreamToken(t, SECRET, 2_000)).toBeNull();
    expect(verifyStreamToken(t, "y".repeat(40), 1_000)).toBeNull();
    const [p, s] = t.split(".");
    expect(verifyStreamToken(`${p}x.${s}`, SECRET, 1_000)).toBeNull();
    expect(verifyStreamToken(`${p}.${s.slice(0, -2)}zz`, SECRET, 1_000)).toBeNull();
    expect(verifyStreamToken(null, SECRET)).toBeNull();
  });

  it("checks the app's shared secret in constant time and refuses a missing or wrong one", () => {
    expect(serviceAuthorized(SECRET, SECRET)).toBe(true);
    expect(serviceAuthorized([SECRET], SECRET)).toBe(true);
    expect(serviceAuthorized(`${SECRET}x`, SECRET)).toBe(false);
    expect(serviceAuthorized(undefined, SECRET)).toBe(false);
    expect(serviceAuthorized("", "")).toBe(false);
  });

  it("lets the helper reach only the five session routes", () => {
    expect(allowedHelperPath("/api/jobs-apply/extension/inspect")).toBe(true);
    expect(allowedHelperPath("/api/jobs-apply/extension/file?kind=resume")).toBe(true);
    expect(allowedHelperPath("/api/jobs-apply/sessions")).toBe(false);
    expect(allowedHelperPath("/api/extension/profile")).toBe(false);
    expect(allowedHelperPath("/api/jobs-apply/extension/inspect?x=1")).toBe(false);
    expect(hostMatches("boards.greenhouse.io", "greenhouse.io")).toBe(true);
    expect(hostMatches("evil-greenhouse.io", "greenhouse.io")).toBe(false);
  });

  it("needs a real secret and an app origin", () => {
    expect(() => readConfig({ CLOUD_BROWSER_SECRET: "short", WONDERJOBS_ORIGIN: "https://a.b" })).toThrow(/32/);
    expect(() => readConfig({ CLOUD_BROWSER_SECRET: SECRET, WONDERJOBS_ORIGIN: "a.b/" })).toThrow(/origin/i);
    const c = readConfig({ CLOUD_BROWSER_SECRET: SECRET, WONDERJOBS_ORIGIN: "https://a.b/", CLOUD_BROWSER_ALLOWED_ORIGINS: "http://localhost:3000, https://a.b" });
    expect(c.appOrigin).toBe("https://a.b");
    expect(c.allowedOrigins).toEqual(["http://localhost:3000", "https://a.b"]);
  });
});

describe("candidate input", () => {
  const vp = { width: 412, height: 860 };
  it("accepts taps, scrolls, text and a few named keys; clamps and rejects the rest", () => {
    expect(parseInput({ t: "tap", x: 10, y: 20 }, vp)).toEqual({ t: "tap", x: 10, y: 20 });
    expect(parseInput({ t: "tap", x: -5, y: 9999 }, vp)).toEqual({ t: "tap", x: 0, y: 860 });
    expect(parseInput({ t: "scroll", x: 1, y: 2, dy: 99_999 }, vp)).toEqual({ t: "scroll", x: 1, y: 2, dy: 4000 });
    expect(parseInput({ t: "text", text: "hi" }, vp)).toEqual({ t: "text", text: "hi" });
    expect(parseInput({ t: "text", text: "" }, vp)).toBeNull();
    expect(parseInput({ t: "key", key: "Enter" }, vp)).toEqual({ t: "key", key: "Enter" });
    expect(parseInput({ t: "key", key: "Control+Enter" }, vp)).toBeNull();
    expect(parseInput({ t: "evaluate", code: "1" }, vp)).toBeNull();
    expect(parseInput("tap", vp)).toBeNull();
  });
});

describe("the deploy image matches the code", () => {
  // The worker runs the Chromium baked into the Playwright image. A playwright bump without the image
  // (Dependabot #170, 2026-10-15) launches no browser at all, and the deploy dies at its health check.
  it("Dockerfile's Playwright image is the version package.json pins", () => {
    const pkg = JSON.parse(readFileSync(path.join(SRC, "../package.json"), "utf8")) as { dependencies: Record<string, string> };
    const pinned = pkg.dependencies.playwright;
    expect(pinned, "pin playwright to an exact version so the image can match it").toMatch(/^\d+\.\d+\.\d+$/);
    const docker = readFileSync(path.join(SRC, "../Dockerfile"), "utf8");
    const image = docker.match(/^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/m)?.[1];
    expect(image, "Dockerfile FROM mcr.microsoft.com/playwright:v<version>-…").toBe(pinned);
  });
});
