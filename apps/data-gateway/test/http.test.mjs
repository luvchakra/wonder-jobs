import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

async function freePort() {
  const s = createServer();
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  const p = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return p;
}
test("HTTP API auth, modules, key rotation and module isolation", { timeout: 12000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "gateway-http-"));
  const port = await freePort();
  const admin = "x".repeat(36), cursor = "y".repeat(36);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/server.mjs", import.meta.url))], {
    env: { ...process.env, GATEWAY_ADMIN_TOKEN: admin, GATEWAY_CURSOR_SECRET: cursor, GATEWAY_DATA_FILE: join(dir, "gateway.json"), GATEWAY_PORT: String(port), GATEWAY_COLLECTORS_ENABLED: "0" }, stdio: "ignore"
  });
  const root = "http://127.0.0.1:" + port;
  const call = async (path, token, body, method = body ? "POST" : "GET") => {
    const response = await fetch(root + path, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };
  try {
    let up = false;
    for (let i = 0; i < 70; i++) {
      if (child.exitCode !== null) break;
      try { const r = await call("/v1/health"); if (r.status === 200) { up = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(up, true, "Gateway process failed to start");
    assert.equal((await call("/v1/modules")).status, 401);
    assert.equal((await call("/v1/admin/keys", "no")).status, 401);
    const issuance = await call("/v1/admin/keys", admin, { scopes: ["read:jobs", "read:events"] });
    assert.equal(issuance.status, 201);
    const key = issuance.body.key, keyId = issuance.body.record.id;
    assert.deepEqual((await call("/v1/modules", key)).body.modules, ["jobs", "events"]);
    assert.equal((await call("/v1/search", key, { module: "therapists" })).status, 403);
    assert.equal((await call("/v1/search", key, { module: "jobs", query: "engineer" })).body.results.length, 0);
    const denied = await call("/v1/admin/sources", admin, { url: "https://example.org/jobs", kind: "structured", modules: ["jobs"], permission: "denied" });
    assert.equal(denied.status, 403);
    const list = await call("/v1/admin/keys", admin);
    assert.equal(list.status, 200);
    assert.ok(!JSON.stringify(list.body).includes(key));
    const rotation = await call("/v1/admin/keys/" + keyId + "/rotate", admin, {});
    assert.equal(rotation.status, 201);
    assert.equal((await call("/v1/modules", key)).status, 401);
    assert.equal((await call("/v1/modules", rotation.body.key)).status, 200);
    await call("/v1/admin/keys/" + rotation.body.record.id + "/revoke", admin, {});
    assert.equal((await call("/v1/modules", rotation.body.key)).status, 401);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); });
    await rm(dir, { recursive: true, force: true });
  }
});
