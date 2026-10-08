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

  it("only input.ts drives the page, and only with what the candidate sent", () => {
    const acts = /\.(click|dblclick|press|tap|fill|type|check|selectOption|setInputFiles|submit)\(|\bkeyboard\.|\bmouse\.|dispatchEvent\(/;
    for (const f of files) {
      const src = readFileSync(path.join(SRC, f), "utf8");
      if (f === "input.ts") expect(src).toMatch(/relayInput/);
      else expect(src, f).not.toMatch(acts);
    }
    // And input.ts relays exactly the four candidate gestures — no scripted sequence, no submit.
    const input = readFileSync(path.join(SRC, "input.ts"), "utf8");
    expect(input).not.toMatch(/submit|\.evaluate\(|setInputFiles/);
    expect([...KEYS]).not.toContain("F5");
  });

  it("runs the extension's own helper script behind a message shim", () => {
    const script = pageScript();
    expect(script.startsWith(SHIM)).toBe(true);
    expect(script).toContain("window.__wonderjobsHelper");
    expect(script).toContain("Never in WonderJobs' cloud browser");
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
