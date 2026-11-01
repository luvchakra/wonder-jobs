import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";

test("a live source's mapping can be updated in place; its id stays, and only some fields may change", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gw-update-"));
  try {
    const admin = "a".repeat(40);
    const store = await new JsonStore(join(dir, "g.json")).init();
    const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: admin, GATEWAY_CURSOR_SECRET: "c".repeat(40) } });
    const call = (path, body) => gw.handle(new Request("http://x" + path, { method: "POST", headers: { authorization: "Bearer " + admin, "content-type": "application/json" }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
    const created = await call("/v1/admin/sources", { url: "https://api.example.org/jobs.json", kind: "json_api", modules: ["teaching"], permission: "terms_permit", permissionEvidence: "Open licence on the terms page", termsReviewed: true, redistributionAllowed: true, itemsPath: "data", mapping: { id: "url", title: "title", employer: "org", applyUrl: "url", location: "town" } });
    const id = created.body.id;
    const upd = await call(`/v1/admin/sources/${id}/update`, { mapping: { id: "url", title: "title", employer: "org", applyUrl: "url", location: ["town", "region", "country"] } });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.id, id);
    assert.deepEqual((await store.read((s) => s.sources[0].mapping.location)), ["town", "region", "country"]);
    assert.equal((await call(`/v1/admin/sources/${id}/update`, { permission: "granted_in_writing" })).status, 400, "permission can't be changed this way");
    assert.equal((await call(`/v1/admin/sources/${id}/update`, { mapping: { title: 5 } })).status, 400, "the new mapping is validated");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
