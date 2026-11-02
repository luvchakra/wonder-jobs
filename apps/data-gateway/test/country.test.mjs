import test from "node:test";
import assert from "node:assert/strict";
import { sourceCountry, withCountry } from "../src/handler.mjs";

test("a source's single country: from its geography, else its country domain", () => {
  assert.equal(sourceCountry({ geography: ["IN"], url: "https://example.com" }), "IN");
  assert.equal(sourceCountry({ url: "https://teaching-vacancies.service.gov.uk/api/v1/jobs.json" }), "GB");
  assert.equal(sourceCountry({ geography: ["global", "IN"], url: "https://x.in" }), null);
  assert.equal(sourceCountry({ geography: ["global"], url: "https://x.in" }), null);
  assert.equal(sourceCountry({ url: "https://weworkremotely.com/remote-jobs.rss" }), null);
});

test("the place gets its country once, never twice", () => {
  assert.equal(withCountry("Chatham", "GB"), "Chatham, United Kingdom");
  assert.equal(withCountry("London, UK", "GB"), "London, UK");
  assert.equal(withCountry("Leeds, England", "GB"), "Leeds, England");
  assert.equal(withCountry("Mumbai, India", "IN"), "Mumbai, India");
  assert.equal(withCountry("", "FI"), "Finland");
  assert.equal(withCountry("Pune", null), "Pune");
});
