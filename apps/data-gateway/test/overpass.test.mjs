import test from "node:test";
import assert from "node:assert/strict";
import { fetchRecords, overpassOrder, OVERPASS_HOSTS } from "../src/collect.mjs";

const source = (id) => ({ id, kind: "json_api", url: "https://overpass-api.de/api/interpreter?data=x", itemsPath: "elements", mapping: { id: "{type}/{id}", title: "tags.name", organization: "tags.name", applyUrl: "https://www.openstreetmap.org/{type}/{id}" }, organizationOptional: true, permission: "terms_permit", termsReviewed: true, redistributionAllowed: true, modules: ["services"], retentionHours: 168, attribution: "OSM" });
const ok = JSON.stringify({ elements: [{ type: "node", id: 1, tags: { name: "Sharma Plumbing" } }] });
const busy = Object.assign(new Error("Source responded 429"), { code: "SOURCE_UNAVAILABLE" });

test("sources are spread over the public Overpass servers, each trying all of them", () => {
  const starts = new Set(["a", "b", "c", "d", "e", "f"].map((s) => overpassOrder(s)[0]));
  assert.ok(starts.size > 1);
  for (const s of ["a", "src_x"]) assert.deepEqual([...overpassOrder(s)].sort(), [...OVERPASS_HOSTS].sort());
});

test("a server that refuses (429) hands the query to the next one", async () => {
  const asked = [];
  const get = async (u) => { asked.push(new URL(u).hostname); if (asked.length === 1) throw busy; return ok; };
  const r = await fetchRecords(source("src_1"), { get, sleep: async () => {}, now: () => 0 });
  assert.equal(asked.length, 2);
  assert.notEqual(asked[0], asked[1]);
  assert.ok(r.valid >= 1 || r.records?.length >= 1 || JSON.stringify(r).includes("Sharma"));
});

test("other URLs are never rewritten", async () => {
  const asked = [];
  const s = { ...source("src_2"), url: "https://feeds.example.org/x.json" };
  await fetchRecords(s, { get: async (u) => { asked.push(u); return ok; }, sleep: async () => {}, now: () => 0 });
  assert.deepEqual(asked, ["https://feeds.example.org/x.json"]);
});
