import { describe, expect, it } from "vitest";
import { cleanLandingChoice } from "./landing";

describe("the landing page choice", () => {
  it("is the quiet page unless full was chosen", () => {
    expect(cleanLandingChoice(undefined)).toBe("quiet");
    expect(cleanLandingChoice({ page: "quiet" })).toBe("quiet");
    expect(cleanLandingChoice({ page: "full" })).toBe("full");
    expect(cleanLandingChoice({ page: "other" })).toBe("quiet");
  });
});
