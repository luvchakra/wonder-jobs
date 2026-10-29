import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WonderWorks and its modules (CLAUDE.md, "WonderWorks and its modules"):
 * - WonderWorks (`src/wonderstar/`) is the shared layer and imports no module: nothing under `src/modules/`, and none of
 *   the Jobs module's code that still lives at its older paths (JOBS_OWNED).
 * - A module (`src/modules/<id>/`) never contains or imports another module's code: no other module's folder, none of
 *   the composition root's files (`src/modules/*.ts(x)`, which wire every module together), and — for any module but
 *   Jobs — none of Jobs' code at its older paths. Shared things move up into WonderWorks.
 * Type-only imports count too: a module's types are its code.
 */
const SRC = resolve(__dirname, "..");

/** Jobs module code that hasn't moved into `src/modules/jobs/` yet. Nothing outside Jobs may import it. */
const JOBS_OWNED = ["store/jobs", "store/applications", "domain/jobs/", "domain/applications/", "services/jobs/", "lib/switchFindMode"];

/**
 * Imports a module may keep while it moves onto WonderWorks, by exact file and specifier, so nothing else can slip
 * through. Empty: every module is on WonderWorks. Add nothing here without a plan to remove it.
 */
const KNOWN: Record<string, string[]> = {};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Every import, re-export and dynamic import, as a path under `src/` (aliases and relative paths resolved). */
function imports(file: string): { spec: string; target: string }[] {
  const src = readFileSync(file, "utf8");
  const specs = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm), ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g), ...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  return specs.flatMap((spec) => {
    if (spec.startsWith("@/")) return [{ spec, target: spec.slice(2) }];
    if (spec.startsWith(".")) return [{ spec, target: relative(SRC, resolve(dirname(file), spec)) }];
    return [];
  });
}

const jobsOwned = (t: string) => JOBS_OWNED.some((p) => t === p.replace(/\/$/, "") || t.startsWith(p.endsWith("/") ? p : `${p}/`) || t === p);
const moduleOf = (t: string) => /^modules\/([^/]+)\//.exec(t)?.[1];
const MODULES = readdirSync(join(SRC, "modules")).filter((n) => statSync(join(SRC, "modules", n)).isDirectory());

describe("WonderWorks and its modules", () => {
  it("WonderWorks imports no module and none of Jobs' code", () => {
    const offenders = files(join(SRC, "wonderstar"))
      .filter((f) => f !== __filename)
      .flatMap((f) => imports(f).filter(({ target }) => target.startsWith("modules/") || target === "modules" || target.startsWith("app/") || jobsOwned(target)).map(({ spec }) => `${relative(SRC, f)} → ${spec}`));
    expect(offenders).toEqual([]);
  });

  it.each(MODULES)("the %s module imports only WonderWorks, the app's foundation and itself", (id) => {
    const offenders = files(join(SRC, "modules", id)).flatMap((f) => {
      const rel = relative(SRC, f);
      return imports(f)
        .filter(({ spec, target }) => {
          if (KNOWN[rel]?.includes(spec)) return false;
          if (target.startsWith("modules/")) return moduleOf(target) !== id;
          if (target === "modules") return true;
          return id !== "jobs" && jobsOwned(target);
        })
        .map(({ spec }) => `${rel} → ${spec}`);
    });
    expect(offenders).toEqual([]);
  });

  it("each known exception still exists, so the list only ever shrinks", () => {
    for (const [file, specs] of Object.entries(KNOWN)) {
      const found = imports(join(SRC, file)).map((i) => i.spec);
      for (const s of specs) expect(found, `${file} no longer imports ${s}: remove it from KNOWN`).toContain(s);
    }
  });

  it("catches what it should", () => {
    expect(jobsOwned("store/jobs")).toBe(true);
    expect(jobsOwned("domain/jobs/types")).toBe(true);
    expect(jobsOwned("store/jobsLake")).toBe(false);
    expect(jobsOwned("domain/jobslake/protocol")).toBe(false);
    expect(moduleOf("modules/jobs/nav")).toBe("jobs");
    expect(moduleOf("modules/registry")).toBeUndefined();
  });
});
