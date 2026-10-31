// Registers a reviewed source definition (sources/*.json) with a running gateway. The source starts paused.
//   GATEWAY_URL=http://127.0.0.1:8790 GATEWAY_ADMIN_TOKEN=… node src/register.mjs sources/we-work-remotely.json
import { readFile } from "node:fs/promises";

const [file] = process.argv.slice(2);
const base = (process.env.GATEWAY_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
if (!file || !process.env.GATEWAY_ADMIN_TOKEN) { console.error("Usage: GATEWAY_ADMIN_TOKEN=… node src/register.mjs <sources/file.json>"); process.exit(2); }
const response = await fetch(base + "/v1/admin/sources", { method: "POST", headers: { authorization: "Bearer " + process.env.GATEWAY_ADMIN_TOKEN, "content-type": "application/json" }, body: await readFile(file, "utf8") });
const body = await response.json();
if (!response.ok) { console.error("Refused:", response.status, body.error?.code, body.error?.message); process.exit(1); }
console.log("Registered (paused):", body.id, "- next: POST /v1/admin/sources/" + body.id + "/test, then /activate");
