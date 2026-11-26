import { describe, expect, it } from "vitest";
import { cleanProfileName, DEFAULT_PROFILE_NAME, PROFILE_NAME_MAX, profileNameOf } from "./profileName";

describe("the Career Profile's name", () => {
  it("reads My profile until named, and for an empty or blank name", () => {
    expect(profileNameOf({})).toBe(DEFAULT_PROFILE_NAME);
    expect(profileNameOf({ profileName: "   " })).toBe("My profile");
    expect(profileNameOf(undefined)).toBe("My profile");
  });

  it("keeps the name as typed, tidied and capped", () => {
    expect(profileNameOf({ profileName: "  Identity   &  access " })).toBe("Identity & access");
    expect(cleanProfileName("x".repeat(60))).toHaveLength(PROFILE_NAME_MAX);
    expect(cleanProfileName("")).toBeUndefined();
  });
});
