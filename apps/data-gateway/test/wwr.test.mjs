import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateSource } from "../src/core.mjs";

// We Work Remotely's all-jobs feed grew past the 2 MB response limit (TOO_LARGE, 2026-11-05): the gateway reads its
// category feeds instead, each well under the limit (checked live: 0.1–1.8 MB).
const dir = join(import.meta.dirname, "..", "sources");
const files = readdirSync(dir).filter((f) => f.startsWith("we-work-remotely"));

test("We Work Remotely is read from its category feeds, never the all-jobs feed", () => {
  assert.ok(files.length >= 10, `expected the category feeds, found ${files.length}`);
  assert.ok(!files.includes("we-work-remotely.json"), "the all-jobs definition is gone");
  const urls = new Set();
  const names = new Set();
  for (const f of files) {
    const def = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const s = validateSource(def);
    assert.equal(s.kind, "rss", f);
    assert.match(s.url, /^https:\/\/weworkremotely\.com\/categories\/[a-z-]+\.rss$/, f);
    assert.notEqual(s.url, "https://weworkremotely.com/remote-jobs.rss", f);
    assert.deepEqual(s.modules, ["jobs"], f);
    assert.equal(s.titleCompanyPrefix, true, f);
    assert.equal(s.allRemote, true, f);
    // Credits We Work Remotely (its feed terms ask for attribution) and names the category, so the 11 entries tell apart on Admin → Data → Import.
    assert.match(s.attribution, /^We Work Remotely · \S/, f);
    names.add(s.attribution);
    urls.add(s.url);
  }
  assert.equal(urls.size, files.length, "each file reads its own category");
  assert.equal(names.size, files.length, "each file has its own name");
});
