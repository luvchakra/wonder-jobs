import { describe, expect, it } from "vitest";
import { decideHelpAccess } from "./helpAccess";

describe("decideHelpAccess — the help center is for signed-in accounts (WJ-309)", () => {
  const base = { authConfigured: true, signedIn: false, demoCookie: false, demoOffered: false };

  it("signed out with real auth: sign in", () => {
    expect(decideHelpAccess(base)).toBe("sign-in");
  });

  it("signed in: allowed", () => {
    expect(decideHelpAccess({ ...base, signedIn: true })).toBe("allowed");
  });

  it("a demo cookie counts only where the deployment offers a demo (never production)", () => {
    expect(decideHelpAccess({ ...base, demoCookie: true, demoOffered: false })).toBe("sign-in");
    expect(decideHelpAccess({ ...base, demoCookie: true, demoOffered: true })).toBe("allowed");
  });

  it("local-only mode without real auth is open, like the rest of the app", () => {
    expect(decideHelpAccess({ ...base, authConfigured: false })).toBe("allowed");
  });
});
