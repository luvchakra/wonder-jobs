import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODULES, initial, JsonStore, ApiError, issueKey, revokeKey, digestKey, requireConsumer, normalize, validateSource, search, checkScope } from "../src/core.mjs";

const permitted = (overrides = {}) => ({
  url: "https://example.org/jobs.json", kind: "json_api", modules: ["jobs"],
  permission: "terms_permit", termsReviewed: true, redistributionAllowed: true,
  externalRedistributionAllowed: true, permissionEvidence: "Approved public redistribution in API terms",
  itemsPath: "jobs", mapping: { id: "id", title: "title", employer: "employer", location: "location", description: "description", applyUrl: "url", postedAt: "postedAt" }, ...overrides
});
const posting = (overrides = {}) => ({ id: "1", title: "Engineer", employer: "Example", location: "Mumbai", description: "Platform role", url: "https://example.org/jobs/1", postedAt: "2026-10-30T10:00:00Z", ...overrides });
const caller = { id: "key", consumerId: "workslake", scopes: MODULES.map((x) => "read:" + x) };

test("eight module ids are supported", () => assert.deepEqual(MODULES, ["jobs", "internships", "teaching", "services", "therapists", "cofounders", "events", "marketplace"]));
test("source registration fails closed on missing permission and sensitive consent", () => {
  assert.throws(() => validateSource(permitted({ permission: "denied" })), /Documented permission/);
  assert.throws(() => validateSource(permitted({ termsReviewed: false })), /Documented permission/);
  assert.throws(() => validateSource(permitted({ modules: ["cofounders"] })), /verified opt-in/);
  assert.throws(() => validateSource(permitted({ url: "http://example.org" })), /HTTPS/);
  assert.throws(() => validateSource(permitted({ kind: "structured" })), /Robots review/);
  assert.equal(validateSource(permitted({ modules: ["cofounders"], consentVerified: true })).modules[0], "cofounders");
});
test("source mapping preserves genuine dates and does not invent timestamps", () => {
  const src = validateSource(permitted());
  const dated = normalize(src, posting(), "jobs");
  assert.equal(dated.publishedAt, "2026-10-30T10:00:00.000Z");
  assert.equal(normalize(src, posting({ postedAt: null }), "jobs").publishedAt, null);
  assert.equal(normalize(src, posting({ url: "javascript:alert(1)" }), "jobs"), null);
  assert.equal(dated.sourceId, src.id);
});
test("scope enforcement prevents dataset leakage", () => {
  const s = initial();
  const src = { ...validateSource(permitted({ modules: ["jobs", "events"] })), enabled: true };
  s.sources.push(src);
  s.listings.push(normalize(src, posting(), "jobs"), normalize(src, posting({ title: "Community event" }), "events"));
  const onlyJobs = { ...caller, scopes: ["read:jobs"] };
  const jobs = search(s, onlyJobs, { module: "jobs", query: "" }, "some sufficiently strong cursor key");
  assert.equal(jobs.results.length, 1);
  assert.equal(jobs.results[0].module, "jobs");
  assert.throws(() => search(s, onlyJobs, { module: "events" }, "strong enough secret"), (e) => e.status === 403);
  assert.throws(() => checkScope(onlyJobs, "unknown"), (e) => e.status === 400);
});
test("external consumer cannot see internal-only data", () => {
  const s = initial();
  const src = { ...validateSource(permitted({ externalRedistributionAllowed: false })), enabled: true };
  s.sources.push(src);
  s.listings.push(normalize(src, posting(), "jobs"));
  assert.equal(search(s, caller, { module: "jobs" }, "cursor secret").results.length, 1);
  assert.equal(search(s, { ...caller, consumerId: "partner" }, { module: "jobs" }, "cursor secret").results.length, 0);
});
test("expired listings are never served and cursors bind to the search", () => {
  const s = initial();
  const src = { ...validateSource(permitted()), enabled: true };
  s.sources.push(src);
  s.listings.push(normalize(src, posting({ id: "1" }), "jobs"), normalize(src, posting({ id: "2" }), "jobs"));
  s.listings.push({ ...normalize(src, posting({ id: "3" }), "jobs"), expiresAt: "2020-01-01T00:00:00Z" });
  const a = search(s, caller, { module: "jobs", limit: 1 }, "cursor secret");
  assert.equal(a.results.length, 1);
  assert.ok(a.nextCursor);
  assert.equal(search(s, caller, { module: "jobs", limit: 1, cursor: a.nextCursor }, "cursor secret").results.length, 1);
  assert.throws(() => search(s, caller, { module: "jobs", limit: 1, query: "different", cursor: a.nextCursor }, "cursor secret"), /Cursor does not match/);
});
test("API keys are one-time generated, scoped, revocable, and not stored in plaintext", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gateway-keys-"));
  try {
    const db = await new JsonStore(join(dir, "db.json")).init();
    const issued = await db.change((s) => issueKey(s, { scopes: ["read:jobs"] }));
    assert.match(issued.key, /^wlg_[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(db.data).includes(issued.key));
    assert.equal(db.data.keys[0].hash, digestKey(issued.key));
    assert.equal((await requireConsumer(db, "Bearer " + issued.key)).consumerId, "workslake");
    assert.ok(!issued.record.hash);
    await db.change((s) => revokeKey(s, issued.record.id));
    await assert.rejects(() => requireConsumer(db, "Bearer " + issued.key), (e) => e instanceof ApiError && e.status === 401);
    await assert.rejects(() => requireConsumer(db, "Bearer no"), (e) => e.status === 401);
    await assert.rejects(() => requireConsumer(db, "Bearer wlg_" + "0".repeat(64)), (e) => e.status === 401);
    assert.throws(() => issueKey(db.data, { consumerId: "public-app", scopes: ["read:jobs"] }), /External consumers are disabled/);
    const reopened = await new JsonStore(join(dir, "db.json")).init();
    assert.equal(reopened.data.keys[0].revokedAt !== null, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("an unmapped or non-text field is left out, never the whole record", () => {
  const src = validateSource(permitted({ mapping: { id: "id", title: "title", employer: "employer", applyUrl: "url" } }));
  const got = normalize(src, posting({ location: { city: "Pune" } }), "jobs");
  assert.equal(got.description, "");
  assert.equal(got.location, "");
  assert.equal(got.organization, "Example");
  assert.equal(normalize(src, posting({ employer: { name: "x" } }), "jobs"), null);
});
import { RateLimiter } from "../src/core.mjs";
import { OPENAPI } from "../src/openapi.mjs";
test("rate limiter allows the minute's allowance per key, then says when to retry, then renews", () => {
  let t = 1_000_000;
  const l = new RateLimiter(2, () => t);
  assert.equal(l.take("a"), 0);
  assert.equal(l.take("a"), 0);
  assert.ok(l.take("a") > 0);
  assert.equal(l.take("b"), 0, "another key has its own allowance");
  t += 60_000;
  assert.equal(l.take("a"), 0);
});
test("lazy changes are in memory at once and reach the disk on flush", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gateway-lazy-"));
  try {
    const file = join(dir, "g.json");
    const store = await new JsonStore(file).init();
    store.lazy((s) => s.usage.push({ day: "2026-10-31", count: 1 }), 60000);
    assert.equal(store.data.usage.length, 1);
    await store.flush();
    assert.equal((await new JsonStore(file).init()).data.usage.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("the API description covers every module and the keyed routes", () => {
  assert.deepEqual(OPENAPI.components.schemas.Listing.properties.module.enum, MODULES);
  for (const path of ["/v1/search", "/v1/listings/{id}", "/v1/workslake/{module}/listings", "/v1/admin/keys/{id}/rotate", "/v1/admin/sources/{id}/activate"]) assert.ok(OPENAPI.paths[path], path);
});
import { plainText } from "../src/core.mjs";
test("source text is stored as plain text, even markup that arrived escaped", () => {
  assert.equal(plainText("&lt;p&gt;Hello &lt;strong&gt;team&lt;/strong&gt;&lt;/p&gt;"), "Hello team");
  assert.equal(plainText('<p>Hi</p><script>alert(1)</script><style>p{}</style> there &amp; you'), "Hi there & you");
  assert.equal(plainText("&amp;lt;b&amp;gt;x&amp;lt;/b&amp;gt;"), "x", "double-escaped markup too");
  assert.equal(plainText(null), "");
  const src = validateSource(permitted());
  const got = normalize(src, posting({ description: "&lt;img src=x onerror=alert(1)&gt;Great role", title: "<b>Engineer</b>" }), "jobs");
  assert.equal(got.description, "Great role");
  assert.equal(got.title, "Engineer");
});
test("a feed that names the company only as 'Company: Title' is read when the source says so", () => {
  const base = { url: "https://example.org/feed.rss", kind: "rss", modules: ["jobs"], permission: "terms_permit", permissionEvidence: "Feed page invites reuse with attribution", termsReviewed: true, redistributionAllowed: true };
  const raw = { id: "g1", title: "Dropbox: Backend Engineer", canonicalUrl: "https://example.org/j/1", publishedAt: "2026-10-30", location: "Anywhere" };
  assert.equal(normalize(validateSource(base), raw, "jobs"), null, "without the option there is no company, so no listing");
  const got = normalize(validateSource({ ...base, titleCompanyPrefix: true, allRemote: true }), raw, "jobs");
  assert.equal(got.organization, "Dropbox");
  assert.equal(got.title, "Backend Engineer");
  assert.equal(got.remote, true);
});
import { matchesWords, queryWords } from "../src/core.mjs";
test("a query's words each match on their own, in any order", () => {
  assert.deepEqual(queryWords("Tech  Conference, India!"), ["tech", "conference", "india"]);
  assert.deepEqual(queryWords("C++ and node.js"), ["c++", "and", "node.js"]);
  assert.equal(matchesWords("WeAreDevelopers Conference India — the tech event", "tech conference"), true);
  assert.equal(matchesWords("WeAreDevelopers Conference India", "tech conference"), false, "every word must appear");
  assert.equal(matchesWords("anything", ""), true);
});
import { countryName } from "../src/core.mjs";
test("a place can combine town, region and country; a country code reads as its name", () => {
  assert.equal(countryName("GB"), "United Kingdom");
  assert.equal(countryName("IN"), "India");
  assert.equal(countryName("East Midlands"), "East Midlands");
  const src = validateSource(permitted({ mapping: { id: "id", title: "title", employer: "employer", applyUrl: "url", location: ["loc.town", "loc.region", "loc.country"] } }));
  const got = normalize(src, posting({ loc: { town: "Countesthorpe", region: "East Midlands", country: "GB" } }), "jobs");
  assert.equal(got.location, "Countesthorpe, East Midlands, United Kingdom");
  assert.equal(normalize(src, posting({ loc: { town: "London", region: "London", country: "GB" } }), "jobs").location, "London, United Kingdom", "a repeated part shows once");
  assert.throws(() => validateSource(permitted({ mapping: { title: ["a", "b", "c", "d", "e", "f"] } })), /up to 5/);
});
