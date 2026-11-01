import test from "node:test";
import assert from "node:assert/strict";
import { requestTimeoutMs } from "../src/collect.mjs";

test("an Overpass query gets the time it asks the server for, plus 5 s, up to 35 s", () => {
  const q = (n) => "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(`[out:json][timeout:${n}];nwr["craft"](around:15000,28.6,77.2);out center 600;`);
  assert.equal(requestTimeoutMs(q(25)), 30000);
  assert.equal(requestTimeoutMs(q(180)), 35000);
  assert.equal(requestTimeoutMs(q(2)), 12000);
});

test("every other URL keeps the 12 s limit", () => {
  assert.equal(requestTimeoutMs("https://feeds.example.org/jobs.json"), 12000);
  assert.equal(requestTimeoutMs("not a url"), 12000);
});
