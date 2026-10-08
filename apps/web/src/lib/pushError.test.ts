import { describe, expect, it } from "vitest";
import { pushErrorMessage } from "./pushError";

const domError = (name: string, message: string) => Object.assign(new Error(message), { name });

describe("pushErrorMessage", () => {
  it("explains Chrome's push service error in plain words", () => {
    const msg = pushErrorMessage(domError("AbortError", "Registration failed - push service error"));
    expect(msg).not.toMatch(/Registration failed/);
    expect(msg).toMatch(/push service didn't accept/);
  });
  it("tells Brave users which setting to turn on", () => {
    expect(pushErrorMessage(domError("AbortError", "Registration failed - push service error"), true)).toMatch(/Use Google services for push messaging/);
  });
  it("says notifications are blocked when the browser denies them", () => {
    expect(pushErrorMessage(domError("NotAllowedError", "Permission denied"))).toMatch(/blocking notifications/);
  });
  it("passes any other error through", () => {
    expect(pushErrorMessage(new Error("Something else"))).toBe("Something else");
  });
});
