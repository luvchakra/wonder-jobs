import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore, issueKey, normalize, validateSource } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";

const permitted = { url: "https://example.org/jobs.json", kind: "json_api", modules: ["jobs"], permission: "terms_permit", termsReviewed: true, redistributionAllowed: true, externalRedistributionAllowed: true, permissionEvidence: "Approved public redistribution in API terms", itemsPath: "jobs", mapping: { id: "id", title: "title", employer: "employer", location: "location", description: "description", applyUrl: "url", postedAt: "postedAt" } };
const posting = (n) => ({ id: String(n), title: `Engineer ${n}`, employer: "Example", location: "Mumbai", description: "Platform role", url: `https://example.org/jobs/${n}`, postedAt: "2026-10-30T10:00:00Z" });

test("WorksLake's listings read pages past the first 100 with a cursor (Find held 100 a module before)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gw-page-"));
  try {
    const store = await new JsonStore(join(dir, "g.json")).init();
    const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: "a".repeat(40), GATEWAY_CURSOR_SECRET: "c".repeat(40) } });
    const key = await store.change((s) => {
      const src = { ...validateSource(permitted), enabled: true };
      s.sources.push(src);
      for (let n = 1; n <= 150; n++) s.listings.push(normalize(src, posting(n), "jobs"));
      return issueKey(s, { scopes: ["read:jobs"] }).key;
    });
    const get = (q) => gw.handle(new Request("http://x/v1/workslake/jobs/listings" + q, { headers: { authorization: "Bearer " + key } })).then((r) => r.json());
    const first = await get("?limit=100");
    assert.equal(first.items.length, 100);
    assert.ok(first.nextCursor);
    const second = await get(`?limit=100&cursor=${encodeURIComponent(first.nextCursor)}`);
    assert.equal(second.items.length, 50);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((i) => i.id)).size, 150);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
