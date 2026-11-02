import { describe, expect, it } from "vitest";
import { placeWithCountry, singleCountry, withCountry } from "./country";

describe("country in every listing's place", () => {
  it("adds the country once, never twice, and leaves plain Remote alone", () => {
    expect(withCountry("Bengaluru", "IN")).toBe("Bengaluru, India");
    expect(withCountry("Leeds, England", "GB")).toBe("Leeds, England");
    expect(withCountry("Austin, TX, USA", "US")).toBe("Austin, TX, USA");
    expect(withCountry("Remote", "IN")).toBe("Remote");
    expect(withCountry("", "FI")).toBe("Finland");
    expect(withCountry("Pune", null)).toBe("Pune");
  });
  it("uses a source's single country, never for worldwide ones", () => {
    expect(singleCountry(["IN"])).toBe("IN");
    expect(singleCountry(["IN", "remote"])).toBe("IN");
    expect(singleCountry(["global", "IN"])).toBeNull();
    expect(singleCountry(["GB", "US"])).toBeNull();
  });
  it("prefers the job's own country, and doesn't guess one for a remote job", () => {
    const jobs = [
      { location: "Austin, TX", country: "US", workMode: "onsite" },
      { location: "Pune", country: "", workMode: "onsite" },
      { location: "Remote", country: "", workMode: "remote" },
    ];
    expect(placeWithCountry(jobs, ["IN"]).map((j) => j.location)).toEqual(["Austin, TX, United States", "Pune, India", "Remote"]);
  });
});
