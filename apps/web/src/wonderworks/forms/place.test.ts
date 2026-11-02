import { describe, expect, it } from "vitest";
import { countries, joinPlace, splitCountry } from "./place";

describe("a posting's place with its country", () => {
  it("lists every country, India first", () => {
    const list = countries();
    expect(list[0]).toEqual({ code: "IN", name: "India" });
    expect(list.length).toBeGreaterThan(190);
  });
  it("splits a stored place and joins it back", () => {
    expect(splitCountry("Indiranagar, Bengaluru, India")).toEqual({ place: "Indiranagar, Bengaluru", country: "IN" });
    expect(splitCountry("Leeds, UK")).toEqual({ place: "Leeds", country: "GB" });
    expect(splitCountry("Pune")).toEqual({ place: "Pune", country: "" });
    expect(splitCountry("")).toEqual({ place: "", country: "" });
    expect(joinPlace("Indiranagar, Bengaluru", "IN")).toBe("Indiranagar, Bengaluru, India");
    expect(joinPlace("Pune", "")).toBe("Pune");
    expect(joinPlace("", "FI")).toBe("Finland");
  });
  it("a place typed with a trailing comma keeps one comma", () => {
    expect(joinPlace("Pune,", "IN")).toBe("Pune, India");
  });
});
