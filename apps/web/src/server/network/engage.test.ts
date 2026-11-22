import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "../auth";
import { resetTablesForTests, table } from "../db/table";
import * as N from "./network";
import * as S from "./social";
import * as E from "./engage";
import { eraseNetwork, exportNetwork } from "./account";
import { DEFAULT_TIERS, type NetworkProfileInput } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const meera = person("u-meera");

const join = async (s: Session, name: string, more: Partial<NetworkProfileInput> = {}) =>
  (await N.saveMyProfile(s, { name, headline: "IAM lead", location: "", about: "", skills: ["Okta"], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true, ...more })).publicId;
const connect = async (a: Session, b: Session, bId: string) => {
  const v = await N.requestConnection(a, bId, {}, true);
  await N.actOnConnection(b, v.connectionId!, "accept");
  return v.connectionId!;
};
const tick = () => new Promise((r) => setTimeout(r, 3));
const postOf = async (s: Session, text: string) => (await S.feedFor(s)).find((u) => u.text === text)!;

beforeEach(() => resetTablesForTests());

describe("reactions", () => {
  it("one reaction per member, changed or taken back; only on a post the member can see", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    await S.publishPost(asha, { text: "For my connections" }, true);
    const p = await postOf(asha, "For my connections");
    await expect(E.react(kunal, p.id, "like")).rejects.toThrow(/Check what goes/);
    await E.react(kunal, p.id, "like", true);
    await E.react(kunal, p.id, "celebrate", true);
    await E.react(asha, p.id, "celebrate", true);
    expect(await postOf(kunal, "For my connections")).toMatchObject({ reactions: { total: 2, top: ["celebrate"] }, myReaction: "celebrate" });
    await E.react(kunal, p.id, null);
    expect((await postOf(kunal, "For my connections")).myReaction).toBeUndefined();
    // Rahul isn't connected to Asha and the post is for her connections: as if it weren't there.
    await expect(E.react(rahul, p.id, "like", true)).rejects.toThrow(/isn't available/);
    await expect(E.react(kunal, p.id, "angry" as never, true)).rejects.toThrow(/isn't a reaction/);
  });
});

describe("comments", () => {
  it("whoever sees a post sees its comments; the commenter or the author removes one; a block hides it", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    await S.publishPost(asha, { text: "Open to all", audience: "everyone" }, true);
    const p = await postOf(asha, "Open to all");
    const c1 = await E.addComment(kunal, p.id, "  Congrats!  ", true);
    await tick();
    const c2 = await E.addComment(rahul, p.id, "Nice", true);
    expect(c1).toMatchObject({ body: "Congrats!", mine: true, canDelete: true });
    expect((await E.commentsOn(asha, p.id)).map((c) => [c.member.name, c.body, c.canDelete])).toEqual([
      ["Kunal Chakraborty", "Congrats!", true],
      ["Rahul Sen", "Nice", true],
    ]);
    expect((await E.commentsOn(rahul, p.id)).map((c) => [c.body, c.mine, c.canDelete])).toEqual([
      ["Congrats!", false, false],
      ["Nice", true, true],
    ]);
    expect((await postOf(asha, "Open to all")).comments).toBe(2);
    expect(JSON.stringify(await E.commentsOn(rahul, p.id))).not.toMatch(/u-(asha|kunal|rahul)/);
    await expect(E.deleteComment(rahul, c1.id)).rejects.toThrow(/isn't yours/);
    await E.deleteComment(asha, c2.id); // the post's author may remove any comment on it
    // Rahul blocks Kunal: Kunal's comment is gone for him.
    await N.blockMember(rahul, kunalId);
    expect(await E.commentsOn(rahul, p.id)).toEqual([]);
    await expect(E.addComment(rahul, p.id, "   ", true)).rejects.toThrow(/Write a comment/);
  });

  it("a reported comment is hidden from its reporter at once and from everyone at three reporters", async () => {
    await join(asha, "Asha Rao");
    const people = [kunal, rahul, meera, person("u-dev"), person("u-isha")];
    for (const [i, s] of people.entries()) await join(s, `Member ${i}`);
    await S.publishPost(asha, { text: "Hello all", audience: "everyone" }, true);
    const p = await postOf(asha, "Hello all");
    const c = await E.addComment(kunal, p.id, "Spam spam", true);
    await expect(E.reportComment(kunal, c.id, "own")).rejects.toThrow(/isn't available/);
    await E.reportComment(rahul, c.id, "Spam");
    expect(await E.commentsOn(rahul, p.id)).toEqual([]);
    expect(await E.commentsOn(meera, p.id)).toHaveLength(1);
    await E.reportComment(meera, c.id, "Spam");
    await E.reportComment(people[3], c.id, "Spam");
    expect(await E.commentsOn(people[4], p.id)).toEqual([]);
    expect(await E.commentsOn(kunal, p.id)).toHaveLength(1); // its writer isn't told
  });
});

describe("reshares", () => {
  it("only a post for everyone can be reshared; it quotes the original, once per member", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const rahulId = await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    await connect(rahul, kunal, kunalId);
    await S.publishPost(asha, { text: "Connections only" }, true);
    await S.publishPost(asha, { text: "For everyone", audience: "everyone" }, true);
    const closed = await postOf(asha, "Connections only");
    const open = await postOf(asha, "For everyone");
    expect(closed.canReshare).toBe(false);
    expect(open.canReshare).toBe(true);
    await expect(E.resharePost(kunal, closed.id, {}, true)).rejects.toThrow(/for everyone/);
    await E.resharePost(kunal, open.id, { text: "Worth a read" }, true);
    await expect(E.resharePost(kunal, open.id, {}, true)).rejects.toThrow(/already reshared/);
    // Rahul, Kunal's connection, sees the reshare with the original quoted.
    const r = await postOf(rahul, "Worth a read");
    expect(r.canReshare).toBe(true); // a repost for connections still reposts the original, which is for everyone
    expect(r.member.name).toBe("Kunal Chakraborty");
    expect(r.reshared).toMatchObject({ text: "For everyone", member: { name: "Asha Rao" } });
    expect((await postOf(asha, "For everyone")).reshares).toBe(1);
    // Kunal's own feed knows his repost, to undo it.
    const mineNow = await postOf(kunal, "For everyone");
    expect(mineNow.myRepost).toBe(r.id);
    // Resharing the reshare quotes the original.
    await E.resharePost(rahul, r.id, { audience: "everyone" }, true);
    const rr = (await S.feedFor(rahul)).find((u) => u.member.id === rahulId)!;
    expect(rr.reshared?.text).toBe("For everyone");
    // The original is deleted: reshares say it's gone, and its reactions and comments go too.
    await E.addComment(kunal, open.id, "Hi", true);
    await E.react(kunal, open.id, "like", true);
    await S.deleteUpdate(asha, open.id);
    expect((await postOf(rahul, "Worth a read")).reshared).toBeNull();
    expect(await table("network_comments").find({ update_id: open.id })).toEqual([]);
    expect(await table("network_reactions").find({ update_id: open.id })).toEqual([]);
  });
});

describe("account data", () => {
  it("export has the member's comments and reactions; erasure removes theirs and everything on their posts", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await S.publishPost(asha, { text: "Mine", audience: "everyone" }, true);
    await S.publishPost(kunal, { text: "His", audience: "everyone" }, true);
    const mine = await postOf(asha, "Mine");
    const his = await postOf(asha, "His");
    await E.addComment(asha, his.id, "My comment", true);
    await E.react(asha, his.id, "support", true);
    await E.addComment(kunal, mine.id, "On her post", true);
    await E.react(kunal, mine.id, "like", true);
    expect(await exportNetwork("u-asha")).toMatchObject({ commentsYouWrote: [{ on: his.id, body: "My comment" }], reactionsYouGave: [{ on: his.id, reaction: "support" }] });
    await eraseNetwork("u-asha");
    for (const t of ["network_comments", "network_reactions", "network_updates"]) expect(await table(t).find({ tenant_id: "u-asha" }), t).toEqual([]);
    expect(await table("network_comments").find({ update_id: mine.id })).toEqual([]);
    expect(await table("network_reactions").find({ update_id: mine.id })).toEqual([]);
    expect(await table("network_reactions").find({ update_id: his.id })).toEqual([]);
  });
});

describe("before migration 0055", () => {
  it("says likes and comments aren't switched on, rather than failing", async () => {
    await join(asha, "Asha Rao");
    await S.publishPost(asha, { text: "Hi", audience: "everyone" }, true);
    const p = await postOf(asha, "Hi");
    const spy = vi.spyOn(N, "reactions").mockReturnValue({ upsert: async () => Promise.reject(new Error('relation "wonderjobs.network_reactions" does not exist')) } as never);
    await expect(E.react(asha, p.id, "like", true)).rejects.toThrow(/aren't switched on yet/);
    spy.mockRestore();
  });
});

describe("who sees a post, changed after it went out (owner, 2026-11-22)", () => {
  it("Only me is the author's alone; the author widens or narrows it later, and reposts follow", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    await S.publishPost(asha, { text: "Note to self", audience: "only_me" }, true);
    const mine = await postOf(asha, "Note to self");
    expect(mine.kind).toBe("post:me");
    expect((await S.feedFor(kunal)).map((u) => u.text)).not.toContain("Note to self");
    await expect(E.react(kunal, mine.id, "like", true)).rejects.toThrow(/isn't available/);
    await expect(E.commentsOn(kunal, mine.id)).rejects.toThrow(/isn't available/);
    // Widening goes through network.post (asks without the press); narrowing doesn't.
    await expect(S.setAudience(asha, mine.id, "everyone")).rejects.toThrow(/Check what goes/);
    await S.setAudience(asha, mine.id, "everyone", true);
    expect((await postOf(rahul, "Note to self")).canReshare).toBe(true);
    await E.resharePost(rahul, mine.id, { text: "Look" }, true);
    // Back to connections: a stranger's repost no longer shows it, Kunal (a connection) still sees the post.
    await S.setAudience(asha, mine.id, "connections");
    expect((await postOf(rahul, "Look")).reshared).toBeNull();
    expect((await S.feedFor(kunal)).map((u) => u.text)).toContain("Note to self");
    // Only the author changes it.
    await expect(S.setAudience(kunal, mine.id, "only_me")).rejects.toThrow(/isn't yours/);
    await S.setAudience(asha, mine.id, "only_me");
    expect((await S.feedFor(kunal)).map((u) => u.text)).not.toContain("Note to self");
  });
});
