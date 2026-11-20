import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNEL_TYPES, JsonStore, normalizeAll, validateSource } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";
import { CATEGORY_GROUPS } from "../src/prospects.mjs";

// WJ-823: channels for consumer discovery (docs/PROSPECT_DATA_API.md, A6). Events and forums from stored data, with no
// key; gathering places as a category group of businesses.
const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = "a".repeat(40);
const PROSPECT = ["read:businesses", "read:channels", "read:signals", "lookup:enrich", "lookup:contacts"];
const TENANT = "biz_0f3a9c1e-5b7d-4e8a";
const file = async (name) => JSON.parse(await readFile(join(here, "..", name), "utf8"));
const year = new Date().getUTCFullYear() + 1;
// confs.tech's own record shape (conferences/<year>/<topic>.json).
const CONFS = [
  { name: "CityJS Pune", url: "https://pune.cityjsconf.example", startDate: `${year}-02-04`, endDate: `${year}-02-06`, city: "Pune", country: "India", online: false, locales: "EN", cfpUrl: "https://forms.example/cfp", twitter: "@cityjs" },
  { name: "Remote <b>Data</b> Summit", url: "https://remotedata.example", startDate: `${year}-03-10`, endDate: `${year}-03-10`, online: true, locales: "EN,ES" },
];
// api.stackexchange.com/2.3/sites, as it answered on 2026-11-12 (one main site, its meta site).
const SITES = [
  { aliases: ["https://www.stackoverflow.com"], launch_date: 1221436800, site_state: "normal", audience: "professional and enthusiast programmers", site_url: "https://stackoverflow.com", api_site_parameter: "stackoverflow", logo_url: "https://stackoverflow.com/logo.png", name: "Stack Overflow", site_type: "main_site" },
  { site_state: "linked_meta", audience: "professional and enthusiast programmers", site_url: "https://meta.stackoverflow.com", api_site_parameter: "meta.stackoverflow", name: "Meta Stack Overflow", site_type: "meta_site" },
  { site_state: "normal", audience: "professional and amateur chefs", site_url: "https://cooking.stackexchange.com", api_site_parameter: "cooking", name: "Seasoned Advice", site_type: "main_site" },
];

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "gw-channels-"));
  const store = await new JsonStore(join(dir, "g.json")).init();
  const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: ADMIN, GATEWAY_CURSOR_SECRET: "c".repeat(40), GATEWAY_RATE_LIMIT_PER_MINUTE: "100000" }, prospectHooks: { providerKeys: async () => ({}), fetch: () => { throw new Error("stored channels need no provider"); } } });
  const call = async (path, { token = ADMIN, body, tenant } = {}) => {
    const r = await gw.handle(new Request("http://x" + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(tenant ? { "x-tenant-id": tenant } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, body: await r.json() };
  };
  const add = async (def, items) => {
    const src = await call("/v1/admin/sources", { body: def });
    assert.equal(src.status, 201, JSON.stringify(src.body));
    const r = await call(`/v1/admin/sources/${src.body.id}/ingest`, { body: { items } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await call(`/v1/admin/sources/${src.body.id}/activate`, { body: {} })).status, 200);
    return src.body.id;
  };
  await call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
  const key = (await call("/v1/admin/keys", { body: { consumerId: "wonderark", scopes: PROSPECT } })).body.key;
  const events = (await call("/v1/admin/keys", { body: { consumerId: "workslake", scopes: ["read:events"] } })).body.key;
  const search = (body) => call("/v1/prospects/search", { token: key, tenant: TENANT, body });
  return { store, call, add, key, events, search, done: () => rm(dir, { recursive: true, force: true }) };
}

test("with no keys, a channel search returns events and forums from stored data, each with its source and termsPending", async () => {
  const t = await setup();
  try {
    await t.add(await file("sources/confs-tech.json"), CONFS);
    await t.add(await file("sources/stack-exchange-sites.json"), SITES);

    const all = await t.search({ kind: "channel" });
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.deepEqual(all.body.results.map((c) => [c.channelType, c.name]).sort(), [["event", "CityJS Pune"], ["event", "Remote Data Summit"], ["forum", "Seasoned Advice"], ["forum", "Stack Overflow"]], "a meta site is not a forum of its own");
    assert.ok(all.body.results.every((c) => c.kind === "channel" && c.id.startsWith("channels_") && c.source.provider === "stored" && typeof c.source.termsPending === "boolean" && c.source.url && c.observedAt));
    assert.deepEqual(all.body.metadata.providers, [{ id: "stored", status: "ok", returned: 4 }]);

    const ev = await t.search({ kind: "channel", query: "cityjs", filters: { channelTypes: ["event"] } });
    assert.equal(ev.body.results.length, 1);
    const e = ev.body.results[0];
    assert.deepEqual({ ...e, id: null, observedAt: null, source: { ...e.source, id: null } }, {
      id: null, kind: "channel", channelType: "event", name: "CityJS Pune", url: "https://pune.cityjsconf.example/", topics: [], audience: null, language: "en", location: { text: "Pune, India", country: null }, contactUrl: null, description: null,
      event: { startDate: `${year}-02-04`, endDate: `${year}-02-06`, online: false },
      source: { id: null, provider: "stored", name: "confs.tech conference data (tech-conferences/conference-data, MIT License)", url: "https://pune.cityjsconf.example/", termsPending: true }, observedAt: null,
    });
    assert.ok(!JSON.stringify(ev.body).includes("@cityjs") && !JSON.stringify(ev.body).includes("forms.example"), "only the public name, link, dates and place");
    const online = all.body.results.find((c) => c.name === "Remote Data Summit");
    assert.equal(online.event.online, true);
    assert.equal(online.language, null, "two languages are not one: left null");

    const forums = await t.search({ kind: "channel", query: "chefs", filters: { channelTypes: ["forum"] } });
    assert.deepEqual(forums.body.results.map((c) => [c.name, c.url, c.description, c.audience, c.event]), [["Seasoned Advice", "https://cooking.stackexchange.com/", "professional and amateur chefs", null, undefined]]);
    assert.equal(forums.body.results[0].source.termsPending, true);
    assert.equal((await t.search({ kind: "channel", filters: { channelTypes: ["podcast"] } })).body.results.length, 0);

    const listed = (await t.call("/v1/prospects/sources", { token: t.key, tenant: TENANT })).body.sources;
    assert.deepEqual(listed.find((s) => s.id === "stored").kinds, ["channel"]);
    assert.equal(listed.find((s) => s.id === "youtube").status, "needs_setup");
  } finally { await t.done(); }
});

test("binding an events source to channels leaves its Events rows exactly as they were, and no module reads a channel", async () => {
  const def = await file("sources/confs-tech.json");
  const { datasets, channelType, ...before } = def;
  assert.deepEqual(datasets, ["channels"]);
  assert.equal(channelType, "event");
  const at = new Date().toISOString();
  const bound = { ...validateSource(def), id: "src_x" }, plain = { ...validateSource({ ...before, externalRedistributionAllowed: false }), id: "src_x" };
  const rows = normalizeAll(bound, CONFS, at), was = normalizeAll(plain, CONFS, at);
  const events = rows.results.filter((r) => r.module === "events");
  assert.deepEqual(events.map(({ externalRedistributionAllowed, ...r }) => r), was.results.map(({ externalRedistributionAllowed, ...r }) => r));
  assert.ok(events.every((r) => r.attributes.channelType === undefined && r.tokens === undefined));
  assert.equal(rows.valid, was.valid, "the source's quality is judged on its Events rows, as before");
  assert.equal(rows.datasetRows, 2);
  assert.ok(rows.results.filter((r) => r.module === "channels").every((r) => r.attributes.channelType === "event" && r.tokens.includes("catqeventq")));

  const t = await setup();
  try {
    await t.add(def, CONFS);
    const mine = await t.call("/v1/search", { token: t.events, body: { module: "events" } });
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.equal(mine.body.results.length, 2);
    assert.ok(mine.body.results.every((r) => r.id.startsWith("events_")));
    assert.equal((await t.call("/v1/search", { token: t.events, body: { module: "channels" } })).status, 400);
    assert.equal((await t.call("/v1/search", { token: t.key, body: { module: "events" } })).status, 403);
  } finally { await t.done(); }
});

test("only confs.tech among the Events sources feeds channels: the others' files do not allow outside use", async () => {
  const others = ["devfolio-hackathons", "district-events", "hackerearth-events", "hasgeek-events", "helsinki-linkedevents", "konfhub-events", "linux-foundation-events", "osm-calendar"];
  for (const name of others) {
    const def = await file(`sources/${name}.json`);
    assert.equal(def.externalRedistributionAllowed, false, name);
    assert.equal(def.datasets, undefined, name);
  }
  // A channel type belongs to a channels binding and is one of the contract's types.
  const def = await file("sources/confs-tech.json");
  assert.throws(() => validateSource({ ...def, datasets: undefined }), /channelType/);
  assert.throws(() => validateSource({ ...def, channelType: "person" }), /channelType/);
  assert.ok(CHANNEL_TYPES.includes("event") && CHANNEL_TYPES.includes("forum") && !CHANNEL_TYPES.includes("person"));
  // An outside consumer does not see a channels source whose flag says no.
  const t = await setup();
  try {
    await t.add({ ...def, externalRedistributionAllowed: false }, CONFS);
    assert.deepEqual((await t.search({ kind: "channel" })).body.results, []);
  } finally { await t.done(); }
});

test("gathering_places, as the contract spells it, is where people meet: schools, colleges, coaching centres, gyms, clubs, community centres, coworking spaces", async () => {
  assert.deepEqual(CATEGORY_GROUPS.gatheringplaces, ["education", "fitnesscommunity"]);
  // The collection puts each of those kinds of place in one of the two groups.
  const cfg = await file("prospects/overture-places.json");
  const inGroup = (id) => { const g = cfg.groups.find((x) => x.id === id); return [...g.basic, ...g.taxonomy]; };
  for (const c of ["elementary_school", "high_school", "college_university", "tutoring_service"]) assert.ok(inGroup("education").includes(c), c);
  for (const c of ["gym", "sport_or_recreation_club", "social_club", "community_center", "coworking_space"]) assert.ok(inGroup("fitness_community").includes(c), c);

  const t = await setup();
  try {
    const overture = await file("sources/overture-places-in.json");
    const place = (n, name, categories) => ({ id: "ov-" + n, name, url: "https://explore.overturemaps.org/#17/18.52/73.85", categories, website: `https://place${n}.example`, city: "Pune", lat: 18.52, lon: 73.85 });
    await t.add(overture, [place(1, "Deccan Coaching Centre", "tutoring_service,education"), place(2, "Kothrud Gym", "gym,fitness_community"), place(3, "Baner Cowork", "coworking_space,fitness_community"), place(4, "Shree Electricals", "electrician,trades")]);
    for (const spelling of ["gathering_places", "gatheringPlaces", "Gathering places"]) {
      const r = await t.search({ kind: "business", filters: { categoryGroup: spelling }, locations: [{ text: "Pune", country: "IN" }] });
      assert.equal(r.status, 200, spelling);
      assert.deepEqual(r.body.results.map((b) => b.name).sort(), ["Baner Cowork", "Deccan Coaching Centre", "Kothrud Gym"], spelling);
    }
    assert.equal((await t.search({ kind: "business", filters: { categoryGroup: "nowhere" } })).status, 400);
  } finally { await t.done(); }
});
