import { describe, expect, it } from "vitest";
import { MAIN_PROFILE, openedProfile } from "./profiles";

describe("which Career Profile opens", () => {
  const roles = [{ id: "r1" }, { id: "r2" }];
  it("opens the role searched as", () => {
    expect(openedProfile("r2", roles)).toBe("r2");
  });
  it("opens My profile with no role, or one since deleted", () => {
    expect(openedProfile(null, roles)).toBe(MAIN_PROFILE);
    expect(openedProfile("gone", roles)).toBe(MAIN_PROFILE);
  });
});
