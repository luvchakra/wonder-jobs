import { createServer } from "node:http";
import { resolve } from "node:path";
import { JsonStore } from "./core.mjs";
import { createGateway } from "./handler.mjs";

const env = process.env;
const store = await new JsonStore(resolve(env.GATEWAY_DATA_FILE || "./.data/gateway.json")).init();
const gateway = createGateway({ store, env, storage: "local_durable_file" });

/** Node's request as a web Request (the body is read whole; the handler refuses an oversized one). */
async function toRequest(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 70000) break; chunks.push(chunk); }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
  return new Request(new URL(req.url, "http://localhost"), { method: req.method, headers: req.headers, body });
}

const server = createServer(async (req, res) => {
  const response = await gateway.handle(await toRequest(req));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(Number(env.GATEWAY_PORT || "8790"), env.GATEWAY_HOST || "127.0.0.1", () => console.log("WorksLake Data Gateway listening"));

if (env.GATEWAY_COLLECTORS_ENABLED === "1") {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { for (const o of await gateway.collectDue()) if (!o.ok) console.error("Gateway collector failed:", o.sourceId, o.code || "SOURCE_UNAVAILABLE"); }
    catch (e) { console.error("Gateway scheduler error", e.code || "INTERNAL"); }
    finally { running = false; }
  };
  setInterval(tick, 60_000).unref();
  tick();
}

// Usage counts are written lazily; write them before the process goes.
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { server.close(); store.flush().catch(() => undefined).finally(() => process.exit(0)); });
