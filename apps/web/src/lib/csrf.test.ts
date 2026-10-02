import { describe, expect, it } from "vitest";
import { isCrossSiteMutation } from "./csrf";

const H = (h: Record<string, string>) => new Headers(h);
const HOST = "jobs.example.com";

describe("isCrossSiteMutation", () => {
  it("never blocks safe methods", () => {
    expect(isCrossSiteMutation("GET", H({ origin: "https://evil.com", "sec-fetch-site": "cross-site" }), HOST)).toBe(false);
  });
  it("blocks a POST from another site", () => {
    expect(isCrossSiteMutation("POST", H({ origin: "https://evil.com" }), HOST)).toBe(true);
    expect(isCrossSiteMutation("DELETE", H({ "sec-fetch-site": "cross-site" }), HOST)).toBe(true);
    expect(isCrossSiteMutation("PUT", H({ origin: "null" }), HOST)).toBe(true);
    expect(isCrossSiteMutation("POST", H({ origin: "https://evil.jobs.example.com.attacker.io" }), HOST)).toBe(true);
  });
  it("blocks a sibling subdomain even though the browser calls it same-site", () => {
    expect(isCrossSiteMutation("POST", H({ origin: "https://blog.example.com", "sec-fetch-site": "same-site" }), HOST)).toBe(true);
  });
  it("allows our own pages", () => {
    expect(isCrossSiteMutation("POST", H({ origin: "https://jobs.example.com", "sec-fetch-site": "same-origin" }), HOST)).toBe(false);
  });
  it("allows bearer-authenticated and server-to-server calls", () => {
    expect(isCrossSiteMutation("POST", H({ authorization: "Bearer x", origin: "chrome-extension://abc" }), HOST)).toBe(false);
    expect(isCrossSiteMutation("POST", H({ "stripe-signature": "t=1,v1=x" }), HOST)).toBe(false);
  });
});
