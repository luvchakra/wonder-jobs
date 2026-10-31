import { test } from "node:test";
import assert from "node:assert/strict";
import { pagedRecords } from "../src/collect.mjs";
import { initial, logRun, MAX_RUNS, validateSource } from "../src/core.mjs";

const src = validateSource({ url: "https://api.example.org/jobs.json", kind: "json_api", modules: ["teaching"], permission: "terms_permit", permissionEvidence: "Open licence published on the terms page", termsReviewed: true, redistributionAllowed: true, itemsPath: "data", nextPath: "links.next", maxPagesPerRun: 2, mapping: { id: "url", title: "title", employer: "org", applyUrl: "url", postedAt: "date" } });
const page = (n, next) => JSON.stringify({ data: [{ url: `https://api.example.org/j/${n}`, title: `Teacher ${n}`, org: `School ${n}`, date: "2026-10-30" }], links: { next } });
const files = {
  "https://api.example.org/jobs.json": page(1, "https://api.example.org/jobs.json?page=2"),
  "https://api.example.org/jobs.json?page=2": page(2, "/jobs.json?page=3"),
  "https://api.example.org/jobs.json?page=3": page(3, "https://evil.example.com/jobs.json?page=4"),
};
const deps = (calls) => ({ get: async (u) => { calls.push(u); return files[u]; }, sleep: async (ms) => calls.push("sleep:" + ms), now: () => 0 });

test("a paged API is read a few pages per run, carrying on, never leaving its host", async () => {
  assert.equal(src.nextPath, "links.next");
  const calls = [];
  const first = await pagedRecords(src, deps(calls));
  assert.deepEqual(first.results.map((r) => r.title), ["Teacher 1", "Teacher 2"]);
  assert.equal(first.crawl.cursor, "https://api.example.org/jobs.json?page=3", "relative next links are resolved");
  assert.ok(calls.includes("sleep:1000"), "waits between pages");
  assert.equal(first.merge, true);
  const second = await pagedRecords({ ...src, crawlCursor: first.crawl.cursor }, deps(calls));
  assert.deepEqual(second.results.map((r) => r.title), ["Teacher 3"]);
  assert.equal(second.crawl.cursor, null, "a next link to another host ends the feed; the next run starts again from page one");
  assert.ok(!calls.some((c) => String(c).includes("evil")));
});

test("a bad nextPath or page count is refused", () => {
  assert.throws(() => validateSource({ ...src, id: undefined, nextPath: "links;drop" }), /nextPath/);
  assert.throws(() => validateSource({ ...src, id: undefined, maxPagesPerRun: 99 }), /maxPagesPerRun/);
});

test("the run log keeps only its newest entries", () => {
  const s = initial();
  for (let i = 0; i < MAX_RUNS + 25; i++) logRun(s, { at: String(i), ok: true });
  assert.equal(s.runs.length, MAX_RUNS);
  assert.equal(s.runs[0].at, "25");
});
