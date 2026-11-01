import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore, validateSource, MODULES } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";
import { parseCsv, uploadMapping } from "../src/upload.mjs";

test("CSV with quotes, doubled quotes, CRLF and a BOM reads as named rows", () => {
  const { headers, records } = parseCsv('﻿Title,organization,url,description\r\n"Counselling, online","Calm Minds","https://calm.example.org/a","She said ""hello""\nsecond line"\r\n,,,\r\n');
  assert.deepEqual(headers, ["title", "organization", "url", "description"]);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "Counselling, online");
  assert.equal(records[0].description, 'She said "hello"\nsecond line');
  assert.deepEqual(uploadMapping(["title", "url", "attr_fee", "location"]).location, "location");
  assert.equal(uploadMapping(["title", "url", "attr_fee"])["attr.fee"], "attr_fee");
});

test("an upload source needs written permission, and sensitive modules need verified consent", () => {
  const base = { url: "https://partner.example.org", kind: "upload", modules: ["marketplace"], permission: "granted_in_writing", permissionEvidence: "Signed agreement with the cooperative, 1 Nov 2026", termsReviewed: true, redistributionAllowed: true };
  assert.throws(() => validateSource({ ...base, consentVerified: true, permission: "terms_permit" }), /written permission/);
  assert.throws(() => validateSource(base), /opt-in/, "marketplace counts as sensitive: consent must be verified");
  assert.equal(validateSource({ ...base, consentVerified: true }).retentionHours, 720);
});

test("register → upload (bad then good) → activate → served only in its module; a bad upload keeps the old list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gw-upload-"));
  try {
    const admin = "a".repeat(40);
    const store = await new JsonStore(join(dir, "g.json")).init();
    const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: admin, GATEWAY_CURSOR_SECRET: "c".repeat(40) } });
    const call = (path, body, token = admin) => gw.handle(new Request("http://x" + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).then(async (r) => ({ status: r.status, body: await r.json() }));
    const src = await call("/v1/admin/sources", { url: "https://calm.example.org", kind: "upload", modules: ["therapists"], permission: "granted_in_writing", permissionEvidence: "Signed letter from Calm Minds Association, 1 Nov 2026", termsReviewed: true, redistributionAllowed: true, consentVerified: true, attribution: "Calm Minds Association" });
    assert.equal(src.status, 201);
    const id = src.body.id;
    assert.equal((await call(`/v1/admin/sources/${id}/refresh`, {})).body.error.code, "UPLOAD_SOURCE", "never fetched");

    const good = "title,organization,url,town,region,country,attr_languages\nAnxiety counselling,Dr Rao,https://calm.example.org/rao,Pune,Maharashtra,IN,\"English, Marathi\"\nGrief support,Ms Iyer,https://calm.example.org/iyer,Mumbai,,IN,Hindi\n";
    const up = await call(`/v1/admin/sources/${id}/upload`, { format: "csv", content: good });
    assert.equal(up.status, 200);
    assert.equal(up.body.ok, true);
    assert.equal(up.body.valid, 2);

    const bad = "title,url\n,https://x.example.org\nNo https,http://x.example.org\n";
    const up2 = await call(`/v1/admin/sources/${id}/upload`, { format: "csv", content: bad });
    assert.equal(up2.body.ok, false);
    assert.ok(up2.body.problems.length >= 1);
    assert.equal(up2.body.kept, null, "a bad upload changes nothing");

    // The bad upload left a failed test, so upload the good one again before activating.
    await call(`/v1/admin/sources/${id}/upload`, { format: "csv", content: good });
    assert.equal((await call(`/v1/admin/sources/${id}/activate`, {})).status, 200);

    const key = (await call("/v1/admin/keys", { scopes: MODULES.map((m) => "read:" + m) })).body.key;
    const t = await call("/v1/search", { module: "therapists" }, key);
    assert.equal(t.body.metadata.matched, 2);
    const rao = t.body.results.find((x) => x.organization === "Dr Rao");
    assert.equal(rao.location, "Pune, Maharashtra, India");
    assert.equal(rao.attributes.languages, "English, Marathi");
    assert.equal((await call("/v1/search", { module: "jobs" }, key)).body.metadata.matched, 0, "never in another module");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
