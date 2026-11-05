import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `{word}` inside a quoted string is shown literally ("About the {noun}"): a placeholder must be a template literal
 * (`About the ${noun}`) or JSX text. This scans the module's components for quoted strings that hold one.
 */
const DIR = join(__dirname, "components");
// A string literal given as a prop (heading="…", heading={"…"}), a property (label: "…") or an argument (f("…")).
const QUOTED_PLACEHOLDER = /(?:=\{?|:|\(|,)\s*(["'])[^"'\n]*\{[A-Za-z_$][\w$.]*\}[^"'\n]*\1/g;

describe("Scholarships copy", () => {
  it("never puts a {placeholder} inside a quoted string", () => {
    const found: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith(".tsx"))) {
      readFileSync(join(DIR, f), "utf8").split("\n").forEach((line, i) => {
        // JSX text between tags ("what the {noun} states") is filled in, so only string literals are checked.
        for (const m of line.matchAll(QUOTED_PLACEHOLDER)) found.push(`${f}:${i + 1}: ${m[0].trim()}`);
      });
    }
    expect(found).toEqual([]);
  });
});
