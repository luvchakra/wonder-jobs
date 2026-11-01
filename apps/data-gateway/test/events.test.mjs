import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRecords } from "../src/collect.mjs";
import { normalize, validateSource } from "../src/core.mjs";

const base = { url: "https://data.example.org/2026/general.json", kind: "json_api", modules: ["events"], permission: "terms_permit", permissionEvidence: "MIT licence in the repository", termsReviewed: true, redistributionAllowed: true, itemsPath: "", organizationOptional: true, dropPastAfter: "endDate", extraUrls: ["https://data.example.org/2026/javascript.json"], mapping: { id: "url", title: "name", location: "city", applyUrl: "url", "attr.startDate": "startDate", "attr.endDate": "endDate", "attr.online": "online", "attr.country": "country" } };
const conf = (name, end, extra = {}) => ({ name, url: `https://${name.toLowerCase()}.example.org/2026`, startDate: end, endDate: end, city: "Pune", country: "India", online: false, ...extra });

test("an event keeps its own dates and place as stated, with no organiser invented", () => {
  const src = validateSource(base);
  const n = normalize(src, conf("JSConf", "2026-12-01", { online: true }), "events");
  assert.equal(n.organization, "");
  assert.deepEqual(n.attributes, { startDate: "2026-12-01", endDate: "2026-12-01", online: true, country: "India" });
  assert.equal(n.publishedAt, null, "an event's date is never used as a posting date");
  assert.equal(normalize(validateSource({ ...base, organizationOptional: false }), conf("X", "2026-12-01"), "events"), null, "without the flag an organiser is still required");
});

test("several files make one source; over events and repeats don't count against it", async () => {
  const files = {
    "https://data.example.org/2026/general.json": JSON.stringify([conf("Alpha", "2026-12-01"), conf("Old", "2026-01-10"), conf("Beta", "2027-02-01")]),
    "https://data.example.org/2026/javascript.json": JSON.stringify([conf("Beta", "2027-02-01"), conf("Gamma", "2026-11-20")]),
  };
  const calls = [];
  const r = await fetchRecords(validateSource(base), { get: async (u) => { calls.push(u); return files[u]; }, sleep: async (ms) => calls.push("sleep:" + ms), now: () => Date.parse("2026-11-01T08:00:00Z") });
  assert.deepEqual(r.results.map((x) => x.title).sort(), ["Alpha", "Beta", "Gamma"]);
  assert.equal(r.past, 1);
  assert.equal(r.repeats, 1);
  assert.equal(r.discovered, 3);
  assert.equal(r.valid / r.discovered, 1);
  assert.ok(calls.includes("sleep:1000"));
});

test("extra files must be on the source's host, and dropPastAfter must name a mapped field", () => {
  assert.throws(() => validateSource({ ...base, extraUrls: ["https://evil.example.com/x.json"] }), /own host/);
  assert.throws(() => validateSource({ ...base, dropPastAfter: "startsAt" }), /dropPastAfter/);
  assert.throws(() => validateSource({ ...base, extraUrls: Array.from({ length: 61 }, (_, i) => `https://data.example.org/${i}.json`) }), /up to 60/);
});

test("a listing carries its organiser's own site for its logo: the one the source names, else an event's own", () => {
  const school = validateSource({ ...base, modules: ["teaching"], organizationOptional: false, dropPastAfter: undefined, extraUrls: undefined, mapping: { id: "url", title: "name", employer: "org", applyUrl: "url", organizationUrl: "site" } });
  assert.equal(normalize(school, { name: "Maths Teacher", org: "Brixham College", url: "https://tv.example.gov.uk/jobs/1", site: "http://www.brixhamcollege.co.uk" }, "teaching").organizationDomain, "brixhamcollege.co.uk");
  assert.equal(normalize(school, { name: "Maths Teacher", org: "Brixham College", url: "https://tv.example.gov.uk/jobs/1" }, "teaching").organizationDomain, undefined, "no site named: none, never the job board's");
  const ev = normalize(validateSource(base), conf("JSConf", "2026-12-01"), "events");
  assert.equal(ev.organizationDomain, "jsconf.example.org");
});
