import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/core.mjs";

const source = { id: "src_osm", kind: "json_api", attribution: "OpenStreetMap contributors (ODbL)", organizationOptional: true, retentionHours: 48, mapping: { id: "{type}/{id}", title: "tags.name", organization: "tags.name", applyUrl: "https://www.openstreetmap.org/{type}/{id}", location: ["tags.addr:suburb", "tags.addr:city"], "attr.craft": "tags.craft", "attr.clat": "center.lat" } };

test("a mapping value with {paths} is a template filled from the record", () => {
  const r = normalize(source, { type: "way", id: 4242, center: { lat: 18.52, lon: 73.85 }, tags: { name: "Sharma Plumbing Works", craft: "plumber", "addr:suburb": "Kothrud" } }, "services");
  assert.equal(r.canonicalUrl, "https://www.openstreetmap.org/way/4242");
  assert.equal(r.title, "Sharma Plumbing Works");
  assert.equal(r.location, "Kothrud");
  assert.deepEqual(r.attributes, { craft: "plumber", clat: 18.52 });
});

test("a node and a way with the same number are two listings, and a template with a missing path leaves the field out (here: no URL, so no listing)", () => {
  const node = normalize(source, { type: "node", id: 7, tags: { name: "A" } }, "services");
  const way = normalize(source, { type: "way", id: 7, tags: { name: "A" } }, "services");
  assert.notEqual(node.id, way.id);
  assert.equal(normalize(source, { id: 7, tags: { name: "A" } }, "services"), null);
});
