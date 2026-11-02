import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("records delivered by the weekly job replace a source's listings, count as its test, and the app never fetches it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gw-ingest-"));
  try {
    const admin = "a".repeat(40);
    const store = await new JsonStore(join(dir, "g.json")).init();
    const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: admin, GATEWAY_CURSOR_SECRET: "c".repeat(40) } });
    const call = (path, body) => gw.handle(new Request("http://x" + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + admin, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).then(async (r) => ({ status: r.status, body: await r.json() }));
    const def = JSON.parse(await readFile(join(here, "..", "sources", "osm-services-north.json"), "utf8"));
    const src = await call("/v1/admin/sources", def);
    assert.equal(src.status, 201);
    const id = src.body.id;

    const items = [
      { type: "node", id: 1, lat: 28.61, lon: 77.2, tags: { name: "Sharma Plumbing Works", craft: "plumber" } },
      { type: "way", id: 2, center: { lat: 28.62, lon: 77.21 }, tags: { name: "Delhi Electricals", craft: "electrician" } },
    ];
    const r = await call(`/v1/admin/sources/${id}/ingest`, { items });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.valid, 2);

    // The test reads the delivery, never Overpass; activation then works; the hourly pass skips it.
    const t = await call(`/v1/admin/sources/${id}/test`, {});
    assert.equal(t.body.ok, true);
    assert.equal((await call(`/v1/admin/sources/${id}/activate`, {})).status, 200);
    const due = await gw.collectDue();
    assert.equal(due.find((o) => o.sourceId === id), undefined);

    assert.equal((await call(`/v1/admin/sources/${id}/ingest`, { items: "nope" })).status, 400);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
