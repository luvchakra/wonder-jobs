import { describe, expect, it } from "vitest";
import { inAppListing } from "./ListingCard";

describe("inAppListing", () => {
  it("opens a listing's public page as its signed-in view inside the app", () => {
    expect(inAppListing("/s/events/devpost%3A123")).toBe("/app/network/listing/events/devpost%3A123");
  });
  it("leaves any other link as it is", () => {
    expect(inAppListing("/app/m/events/listing/abc")).toBe("/app/m/events/listing/abc");
    expect(inAppListing("/app/jobs?job=1")).toBe("/app/jobs?job=1");
  });
});
