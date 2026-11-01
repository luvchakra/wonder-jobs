import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shop = { id: 11139747905729, title: "Hand-block printed cushion cover", handle: "hand-block-printed-cushion-cover", vendor: "Rangsutra", product_type: "Cushion Cover", published_at: "2026-10-20T10:00:00+05:30", body_html: "<p>Cotton, <b>hand-block</b> printed by artisans.</p>", variants: [{ price: "650.00", compare_at_price: "0.00", available: true }], images: [{ src: "https://cdn.shopify.com/s/files/1/0001/img.jpg?v=1" }] };

for (const name of ["chumbak-products", "okhai-products", "tjori-products"]) {
  test(`${name}: a reviewed Shopify catalogue for Buy, Sell & Rent`, async () => {
    const { validateSource, normalize } = await import("../src/core.mjs");
    const def = JSON.parse(fs.readFileSync(new URL(`../sources/${name}.json`, import.meta.url), "utf8"));
    // Only a business's own catalogue, India, with the terms question recorded for the owner.
    assert.deepEqual(def.modules, ["marketplace"]);
    assert.deepEqual(def.geography, ["IN"]);
    assert.equal(def.publicBusinesses, true);
    assert.match(def.permissionEvidence, /^terms pending:/);
    const src = validateSource(def);
    const host = new URL(def.url).hostname;
    // Every further page stays on the shop's own host (the gateway refuses anything else).
    for (const u of def.extraUrls) assert.equal(new URL(u).hostname, host);
    const r = normalize(src, shop, "marketplace");
    assert.ok(r, "a product makes a listing");
    assert.equal(r.organization, "Rangsutra");
    assert.equal(new URL(r.canonicalUrl).hostname, host);
    assert.match(r.canonicalUrl, /\/products\/hand-block-printed-cushion-cover$/);
    assert.equal(r.attributes.price, "650.00");
    assert.equal(r.attributes.available, true);
    assert.equal(r.attributes.category, "Cushion Cover");
    assert.match(r.attributes.image, /^https:\/\/cdn\.shopify\.com\//);
    assert.ok(!/<\/?[a-z]/i.test(r.description), "source HTML is stored as plain text");
  });
}
