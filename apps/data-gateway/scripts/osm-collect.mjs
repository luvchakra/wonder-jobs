#!/usr/bin/env node
/**
 * Weekly OpenStreetMap collection, run by GitHub Actions (osm-collect.yml), not by the app (owner, 2026-11-02): an
 * Overpass query can take minutes, longer than a serverless call allows. For each OpenStreetMap catalogue source it
 * asks the public Overpass servers, one query at a time with a pause between them and a polite User-Agent, then
 * delivers the businesses to the app, which maps and checks them like the source's own fetch (/api/cron/gateway-ingest).
 *
 * Env: SITE (e.g. https://works.wonderapps.biz), CRON_SECRET. Optional: ONLY (a catalogue file name to run alone).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = join(dirname(fileURLToPath(import.meta.url)), "..", "sources");
const HOSTS = ["overpass-api.de", "overpass.private.coffee", "overpass.kumi.systems"];
const UA = "WorksLakeGateway/1.0 (WonderWorks weekly OpenStreetMap collection; +https://works.wonderapps.biz)";
const PAUSE_MS = 10_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(url) {
  let last;
  for (const host of HOSTS) {
    const u = new URL(url);
    u.hostname = host;
    try {
      const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(180_000) });
      if (res.status === 429 || res.status >= 500) { last = new Error(`${host} answered ${res.status}`); await sleep(30_000); continue; }
      if (!res.ok) throw new Error(`${host} answered ${res.status}`);
      const json = await res.json();
      return Array.isArray(json.elements) ? json.elements : [];
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error("No Overpass server answered");
}

async function deliver(site, secret, url, items) {
  const res = await fetch(`${site.replace(/\/$/, "")}/api/cron/gateway-ingest`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ url, items }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  const site = process.env.SITE, secret = process.env.CRON_SECRET;
  if (!site || !secret) { console.log("::warning::SITE and CRON_SECRET are needed"); return; }
  const files = readdirSync(SOURCES).filter((f) => /^osm-(services|therapists)-.+\.json$/.test(f) && (!process.env.ONLY || f === process.env.ONLY));
  let failed = 0;
  for (const file of files) {
    const def = JSON.parse(readFileSync(join(SOURCES, file), "utf8"));
    const urls = [def.url, ...(def.extraUrls ?? [])];
    const seen = new Map();
    let ok = 0;
    for (const u of urls) {
      try {
        for (const el of await overpass(u)) seen.set(`${el.type}/${el.id}`, el);
        ok++;
      } catch (e) {
        console.log(`::warning::${file}: a query failed (${e.message})`);
      }
      await sleep(PAUSE_MS);
    }
    if (!ok) { failed++; console.log(`::error::${file}: no query answered; nothing delivered (the source keeps what it had)`); continue; }
    const r = await deliver(site, secret, def.url, [...seen.values()]);
    console.log(`${file}: ${ok}/${urls.length} queries, ${seen.size} places → ${r.status} ${JSON.stringify(r.body.results?.map((x) => ({ ok: x.body?.ok, valid: x.body?.valid })) ?? r.body.error ?? "")}`);
    if (r.status !== 200) failed++;
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
