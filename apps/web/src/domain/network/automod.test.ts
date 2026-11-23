import { describe, expect, it } from "vitest";
import { autoModCheck, cleanAutoMod, cleanPerms, DEFAULT_AUTOMOD, hasPerm } from "./communities";

const now = new Date("2026-11-23T12:00:00Z");
const old = "2026-10-01T00:00:00Z";
const fresh = "2026-11-23T08:00:00Z";
const post = (text: string, more: Partial<{ joinedAt: string; postsToday: number; isMod: boolean }> = {}) => ({ text, joinedAt: old, now, postsToday: 0, isMod: false, ...more });

describe("AutoMod", () => {
  it("is on in every community by default and lets ordinary posts through", () => {
    expect(DEFAULT_AUTOMOD.on).toBe(true);
    expect(autoModCheck(DEFAULT_AUTOMOD, post("Who has rolled out passkeys?"))).toEqual({ action: "allow" });
  });
  it("holds or removes a post with a watched word, matching whole words only", () => {
    const cfg = cleanAutoMod({ blockedWords: ["Crypto pump", "spam"] });
    expect(autoModCheck(cfg, post("Join my CRYPTO PUMP now"))).toMatchObject({ action: "hold" });
    expect(autoModCheck(cfg, post("anti-spam filters"))).toMatchObject({ action: "hold" });
    expect(autoModCheck(cfg, post("spammy is not the word"))).toEqual({ action: "allow" });
    expect(autoModCheck({ ...cfg, blockedAction: "remove" }, post("spam"))).toMatchObject({ action: "remove" });
  });
  it("holds a new member's links and their posts past the daily limit", () => {
    expect(autoModCheck(DEFAULT_AUTOMOD, post("see https://example.com", { joinedAt: fresh }))).toMatchObject({ action: "hold" });
    expect(autoModCheck(DEFAULT_AUTOMOD, post("see https://example.com"))).toEqual({ action: "allow" });
    expect(autoModCheck(DEFAULT_AUTOMOD, post("again", { joinedAt: fresh, postsToday: 3 }))).toMatchObject({ action: "hold" });
  });
  it("never touches a moderator's post, nor anything when it is off", () => {
    const cfg = cleanAutoMod({ blockedWords: ["spam"] });
    expect(autoModCheck(cfg, post("spam", { isMod: true }))).toEqual({ action: "allow" });
    expect(autoModCheck({ ...cfg, on: false }, post("spam"))).toEqual({ action: "allow" });
  });
  it("cleans what the moderators set: known values only, within bounds", () => {
    const c = cleanAutoMod({ blockedWords: [" Spam ", "spam", "x", 4 as never], newMemberDays: 99, reportsToHold: 0, blockedAction: "nuke" as never });
    expect(c).toMatchObject({ blockedWords: ["spam"], newMemberDays: 30, reportsToHold: 1, blockedAction: "hold", on: true });
  });
});

describe("moderator permissions", () => {
  it("the owner may do everything; a moderator only what they were given", () => {
    expect(hasPerm("owner", [], "settings")).toBe(true);
    expect(hasPerm("moderator", ["posts"], "posts")).toBe(true);
    expect(hasPerm("moderator", ["posts"], "members")).toBe(false);
    expect(hasPerm("moderator", ["everything"], "members")).toBe(true);
    expect(hasPerm("member", ["everything"], "posts")).toBe(false);
  });
  it("a moderator from before permissions keeps full powers", () => {
    expect(hasPerm("moderator", null, "settings")).toBe(true);
  });
  it("Everything stands alone; unknown permissions are dropped", () => {
    expect(cleanPerms(["posts", "everything"])).toEqual(["everything"]);
    expect(cleanPerms(["posts", "root", "posts"])).toEqual(["posts"]);
  });
});
