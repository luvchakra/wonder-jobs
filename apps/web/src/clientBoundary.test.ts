import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Server code never reaches the browser. Scoring rules, prompts, connectors, keys and policy live under
 * `src/server`; a client component (or a module the browser loads) may name their types, never import
 * their code. `import type` is erased at build time, so it's allowed.
 */
const ROOT = join(__dirname);
const BROWSER_DIRS = ["components", "store", "services", "lib", "domain", "content", "wonderworks", "modules"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Value imports (and re-exports) of `@/server/...` or a relative path into `server/`. */
function serverImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(import|export)\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
    const spec = m[3];
    if (/^@\/server(\/|$)/.test(spec) || /(^|\/)server\//.test(spec)) out.push(spec);
  }
  for (const m of src.matchAll(/import\(\s*["'](@\/server\/[^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

describe("client/server boundary", () => {
  it("no browser module imports server code", () => {
    const offenders: string[] = [];
    for (const f of files(ROOT)) {
      const rel = relative(ROOT, f);
      if (rel.startsWith("server/")) continue;
      const src = readFileSync(f, "utf8");
      const browser = /^\s*["']use client["']/m.test(src.slice(0, 200)) || BROWSER_DIRS.some((d) => rel.startsWith(`${d}/`));
      if (!browser) continue;
      for (const spec of serverImports(src)) offenders.push(`${rel} → ${spec}`);
    }
    expect(offenders).toEqual([]);
  });

  it("spots a value import and lets a type import through", () => {
    expect(serverImports('import { secretStore } from "@/server/secrets";')).toEqual(["@/server/secrets"]);
    expect(serverImports('import type { Session } from "@/server/auth";')).toEqual([]);
    expect(serverImports('const m = await import("@/server/hiring");')).toEqual(["@/server/hiring"]);
  });
});
