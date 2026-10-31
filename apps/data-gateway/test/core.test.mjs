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
