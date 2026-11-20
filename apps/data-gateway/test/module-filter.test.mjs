import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAll, validateSource } from "../src/core.mjs";

const def = (over = {}) => ({ url: "https://example.org/list.json", kind: "json_api", modules: ["scholarships", "internships"], permission: "terms_permit", termsReviewed: true, redistributionAllowed: true, permissionEvidence: "Public listings, terms pending", itemsPath: "items", organizationOptional: true, mapping: { id: "id", title: "title", applyUrl: "url", "attr.type": "kind" }, ...over });
const items = [
  { id: "1", title: "PETA India Internship Programme", url: "https://example.org/1", kind: "Internship" },
  { id: "2", title: "Merit Scholarship", url: "https://example.org/2", kind: "Scholarship" },
  { id: "3", title: "Research Fellowship", url: "https://example.org/3", kind: "Fellowship" },
];
const filter = { internships: { field: "attr.type", match: "^internship$" }, scholarships: { field: "attr.type", match: "^internship$", negate: true } };

test("a per-module filter sends each item to the module it belongs in (Buddy4Study's internships to Internships)", () => {
  const src = { ...validateSource(def({ moduleFilter: filter })), enabled: true };
  assert.deepEqual(src.moduleFilter, filter);
  const r = normalizeAll(src, items, new Date().toISOString());
  const by = (m) => r.results.filter((x) => x.module === m).map((x) => x.title);
  assert.deepEqual(by("internships"), ["PETA India Internship Programme"]);
  assert.deepEqual(by("scholarships"), ["Merit Scholarship", "Research Fellowship"]);
  assert.equal(r.filtered, 3);
});

test("no filter keeps every item in every module, as before", () => {
  const r = normalizeAll({ ...validateSource(def()), enabled: true }, items, new Date().toISOString());
  assert.equal(r.results.length, 6);
});

test("a bad filter is refused", () => {
  assert.throws(() => validateSource(def({ moduleFilter: { jobs: { field: "title", match: "x" } } })), /isn't in/);
  assert.throws(() => validateSource(def({ moduleFilter: { internships: { field: "attr.nope", match: "x" } } })), /mapped attr/);
  assert.throws(() => validateSource(def({ moduleFilter: { internships: { field: "title", match: "(" } } })), /valid pattern/);
  assert.throws(() => validateSource(def({ moduleFilter: { internships: { field: "title", match: "x".repeat(201) } } })), /1-200/);
});
