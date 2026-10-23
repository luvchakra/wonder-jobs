import { describe, expect, it } from "vitest";
import { indexOf, searchIn, searchPlaces } from "./search";

const ix = indexOf({
  countries: ["India", "United Arab Emirates", "United Kingdom", "Canada", "Brazil", "United States"],
  cities: [
    ["Mumbai", "Maharashtra", 0],
    ["New York City", "New York", 5],
    ["London", "England", 2],
    ["Sao Paulo", "Sao Paulo", 4],
    ["Dubai", "", 1],
    ["London", "Ontario", 3],
  ],
});

describe("place suggestions", () => {
  it("finds cities by the start of their name, largest first, with where they are", () => {
    expect(searchIn(ix, "lon")).toEqual([
      { name: "London", detail: "England, United Kingdom", kind: "city" },
      { name: "London", detail: "Ontario, Canada", kind: "city" },
    ]);
    expect(searchIn(ix, "Dub")).toEqual([{ name: "Dubai", detail: "United Arab Emirates", kind: "city" }]);
  });

  it("puts countries before cities, and finds a later word of a name", () => {
    expect(searchIn(ix, "united").map((p) => p.name)).toEqual(["United Arab Emirates", "United Kingdom", "United States"]);
    expect(searchIn(ix, "york").map((p) => p.name)).toEqual(["New York City"]);
  });

  it("ignores accents and case, never offers Remote (a work mode, not a place), and waits for two letters", () => {
    expect(searchIn(ix, "SÃO").map((p) => p.name)).toEqual(["Sao Paulo"]);
    expect(searchIn(ix, "remote")).toEqual([]);
    expect(searchIn(ix, "d")).toEqual([]);
  });

  it("searches the bundled world data", async () => {
    const dubai = await searchPlaces("dubai");
    expect(dubai[0]).toEqual({ name: "Dubai", detail: "United Arab Emirates", kind: "city" });
    expect((await searchPlaces("bengal")).some((p) => p.name === "Bengaluru" && p.detail.endsWith("India"))).toBe(true);
  });
});
