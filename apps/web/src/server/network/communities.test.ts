import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const told = vi.hoisted(() => [] as { tenant: string; title: string }[]);
vi.mock("../notifications/deliver", () => ({ deliver: vi.fn(async (tenant: string, n: { title: string }) => (told.push({ tenant, title: n.title }), { pushed: 0, emailed: false })) }));

import type { Session } from "../auth";
import { resetTablesForTests, table } from "../db/table";
import * as N from "./network";
import * as C from "./communities";
import { layOut } from "@/domain/network/communities";
import { DEFAULT_TIERS, type NetworkProfileInput } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const join = async (s: Session, name: string, more: Partial<NetworkProfileInput> = {}) =>
  (await N.saveMyProfile(s, { name, headline: "IAM lead", location: "", about: "", skills: [], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true, ...more })).publicId;
const tick = () => new Promise((r) => setTimeout(r, 3));

beforeEach(() => {
  resetTablesForTests();
  told.length = 0;
});

describe("communities", () => {
  it("a public one is found and read by anyone on the network; only members write", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await expect(C.createCommunity(asha, { name: "Identity people" })).rejects.toThrow(/Check what goes/);
    await expect(C.createCommunity(asha, { name: "ab" }, true)).rejects.toThrow(/at least 3/);
    const c = await C.createCommunity(asha, { name: "  Identity   people ", about: "IAM practitioners", visibility: "public" }, true);
    expect(c).toMatchObject({ name: "Identity people", members: 1, me: { role: "owner", status: "member" }, canRead: true });
    const d = await C.startDiscussion(asha, c.id, { title: "Passkeys in banks?", body: "Who has rolled them out?" }, true);
    expect((await C.listCommunities(kunal, "identity")).discover.map((x) => x.name)).toEqual(["Identity people"]);
    expect((await C.listDiscussions(kunal, c.id)).map((x) => x.title)).toEqual(["Passkeys in banks?"]);
    await expect(C.replyTo(kunal, d.id, { body: "We did" }, true)).rejects.toThrow(/Join this community/);
    await expect(C.startDiscussion(kunal, c.id, { title: "Hello" }  as never, true)).rejects.toThrow(/Join this community/);
    await C.joinCommunity(kunal, c.id);
    await C.replyTo(kunal, d.id, { body: "We did, last year" }, true);
    expect((await C.getCommunity(kunal, c.id)).members).toBe(2);
  });

  it("a private one shows only its name and about until you're in; approval to join goes through its moderators", async () => {
    await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const c = await C.createCommunity(asha, { name: "Bank CISOs", visibility: "private", joinPolicy: "approval" }, true);
    await C.startDiscussion(asha, c.id, { title: "Budget season", body: "" }, true);
    expect((await C.listCommunities(kunal)).discover).toEqual([]); // private: not listed
    const seen = await C.getCommunity(kunal, c.id);
    expect(seen).toMatchObject({ canRead: false, discussions: 0, me: null });
    await expect(C.listDiscussions(kunal, c.id)).rejects.toThrow(/Join this community/);
    await expect(C.communityMembers(kunal, c.id)).rejects.toThrow(/Join this community/);
    expect((await C.joinCommunity(kunal, c.id)).me).toEqual({ role: "member", status: "pending" });
    expect(told.some((t) => t.tenant === "u-asha" && /asked to join Bank CISOs/.test(t.title))).toBe(true);
    expect((await C.communityMembers(asha, c.id)).requests.map((m) => m.member.id)).toEqual([kunalId]);
    await C.actOnMember(asha, c.id, kunalId, "approve");
    expect((await C.listDiscussions(kunal, c.id)).map((d) => d.title)).toEqual(["Budget season"]);
  });

  it("moderators act on members, only the owner on moderators; a ban keeps them out; the last owner can't just leave", async () => {
    await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const rahulId = await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(kunal, c.id);
    await C.joinCommunity(rahul, c.id);
    await expect(C.actOnMember(kunal, c.id, rahulId, "remove")).rejects.toThrow(/moderators/);
    await C.actOnMember(asha, c.id, kunalId, "make_moderator");
    await expect(C.actOnMember(kunal, c.id, rahulId, "make_moderator")).rejects.toThrow(/owner/);
    await C.actOnMember(kunal, c.id, rahulId, "ban");
    await expect(C.getCommunity(rahul, c.id)).rejects.toThrow(/isn't available/);
    expect((await C.joinCommunity(kunal, c.id)).me?.role).toBe("moderator");
    await expect(C.leaveCommunity(asha, c.id)).rejects.toThrow(/only owner/);
    await expect(C.updateCommunity(kunal, c.id, { name: "Renamed" })).rejects.toThrow(/owner/);
    await C.actOnMember(asha, c.id, kunalId, "make_owner");
    await C.leaveCommunity(asha, c.id);
    expect((await C.getCommunity(kunal, c.id)).me?.role).toBe("owner");
  });
});

describe("discussions", () => {
  it("replies nest; the people answered and those following are told; new replies are marked for each reader", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    for (const s of [kunal, rahul]) await C.joinCommunity(s, c.id);
    const d = await C.startDiscussion(asha, c.id, { title: "Passkeys?", body: "Thoughts?" }, true);
    const r1 = await C.replyTo(kunal, d.id, { body: "Yes" }, true);
    expect(told.map((t) => t.tenant)).toEqual(["u-asha"]); // the author follows their discussion
    told.length = 0;
    await C.readDiscussion(rahul, d.id); // Rahul reads it now
    await tick();
    const r2 = await C.replyTo(rahul, d.id, { body: "How?", parentId: r1.id }, true);
    expect(told.map((t) => t.tenant).sort()).toEqual(["u-asha", "u-kunal"]);
    expect(told.find((t) => t.tenant === "u-kunal")?.title).toMatch(/reply to you/);
    await tick();
    await C.replyTo(asha, d.id, { body: "Via the IdP", parentId: r2.id }, true);
    const seenByKunal = await C.readDiscussion(kunal, d.id);
    expect(seenByKunal.replies.map((r) => [r.body, r.isNew, r.byOp])).toEqual([
      ["Yes", false, false],
      ["How?", true, false],
      ["Via the IdP", true, true],
    ]);
    expect((await C.readDiscussion(kunal, d.id)).replies.every((r) => !r.isNew)).toBe(true); // reading marks it read
    const laid = layOut(seenByKunal.replies, (a, b) => a.at.localeCompare(b.at));
    expect(laid.map((l) => [l.reply.body, l.depth, l.descendants])).toEqual([
      ["Yes", 0, 2],
      ["How?", 1, 1],
      ["Via the IdP", 2, 0],
    ]);
    await expect(C.replyTo(kunal, d.id, { body: "x", parentId: "dr_nothere123" }, true)).rejects.toThrow(/isn't available/);
  });

  it("locked discussions take no replies but from moderators; removal, editing and likes follow who may", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    for (const s of [kunal, rahul]) await C.joinCommunity(s, c.id);
    const d = await C.startDiscussion(kunal, c.id, { title: "Hello all", body: "" }, true);
    const r = await C.replyTo(rahul, d.id, { body: "Hi" }, true);
    const under = await C.replyTo(kunal, d.id, { body: "Welcome", parentId: r.id }, true);
    await expect(C.moderate(kunal, d.id, { locked: true })).rejects.toThrow(/moderators/);
    await C.moderate(asha, d.id, { locked: true, pinned: true });
    await expect(C.replyTo(rahul, d.id, { body: "More" }, true)).rejects.toThrow(/locked/);
    await expect(C.editPost(kunal, r.id, { body: "edited" })).rejects.toThrow(/isn't yours/);
    await C.editPost(rahul, r.id, { body: "Hi everyone" });
    await C.vote(kunal, r.id, 1, true);
    await C.vote(asha, r.id, 1, true);
    let read = await C.readDiscussion(rahul, d.id);
    expect(read.replies[0]).toMatchObject({ body: "Hi everyone", score: 2, editedAt: expect.any(String) });
    expect(read.discussion).toMatchObject({ pinned: true, locked: true });
    await expect(C.removePost(kunal, r.id)).rejects.toThrow(/isn't yours/);
    await C.removePost(asha, r.id); // a moderator removes it: its words go, the reply under it stays
    read = await C.readDiscussion(rahul, d.id);
    expect(read.replies.map((x) => [x.deleted, x.body, x.author?.name ?? null, x.parentId])).toEqual([
      [true, "", null, null],
      [false, "Welcome", "Kunal Chakraborty", r.id],
    ]);
    expect(under.id).toBe(read.replies[1].id);
    await C.removePost(kunal, d.id); // its author removes the discussion with everything in it
    expect(await table("network_replies").find({ thread_id: d.id })).toEqual([]);
  });

  it("a block hides the other's discussions and folds their replies, so the tree still reads", async () => {
    await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    for (const s of [kunal, rahul]) await C.joinCommunity(s, c.id);
    await C.startDiscussion(kunal, c.id, { title: "Kunal's topic", body: "" }, true);
    const d = await C.startDiscussion(asha, c.id, { title: "Asha's topic", body: "" }, true);
    const k = await C.replyTo(kunal, d.id, { body: "Kunal here" }, true);
    await C.replyTo(asha, d.id, { body: "Thanks", parentId: k.id }, true);
    await N.blockMember(rahul, kunalId);
    expect((await C.listDiscussions(rahul, c.id)).map((x) => x.title)).toEqual(["Asha's topic"]);
    const read = await C.readDiscussion(rahul, d.id);
    expect(read.replies.map((r) => [r.hidden ?? false, r.body])).toEqual([
      [true, ""],
      [false, "Thanks"],
    ]);
    expect(JSON.stringify(read)).not.toMatch(/u-(asha|kunal|rahul)|@example/);
  });
});

describe("account data", () => {
  it("erasure hands owned communities on, removes the person's discussions, and blanks their replies elsewhere", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    const solo = await C.createCommunity(asha, { name: "Just me" }, true);
    await C.joinCommunity(kunal, c.id);
    const mine = await C.startDiscussion(asha, c.id, { title: "Mine", body: "" }, true);
    const his = await C.startDiscussion(kunal, c.id, { title: "His", body: "" }, true);
    const r = await C.replyTo(asha, his.id, { body: "Asha's reply" }, true);
    await C.replyTo(kunal, his.id, { body: "Kunal answers", parentId: r.id }, true);
    await C.vote(asha, his.id, 1, true);
    expect(await C.exportCommunities("u-asha")).toMatchObject({ discussionsYouStarted: [{ title: "Mine" }], repliesYouWrote: [{ body: "Asha's reply" }] });
    await C.eraseCommunities("u-asha");
    expect((await C.getCommunity(kunal, c.id)).me?.role).toBe("owner");
    expect(await table("network_communities").find({ id: solo.id })).toEqual([]);
    expect(await table("network_threads").find({ id: mine.id })).toEqual([]);
    const read = await C.readDiscussion(kunal, his.id);
    expect(read.replies.map((x) => [x.deleted, x.body])).toEqual([
      [true, ""],
      [false, "Kunal answers"],
    ]);
    for (const t of ["network_community_members", "network_threads", "network_replies", "network_votes", "network_thread_marks"]) expect(await table(t).find({ tenant_id: "u-asha" }), t).toEqual([]);
  });
});

describe("modules in communities (owner, 2026-11-22)", () => {
  it("a community may name its module; browsing from that module, its communities come first", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const big = await C.createCommunity(asha, { name: "Everything IAM" }, true);
    await C.joinCommunity(kunal, big.id);
    const teach = await C.createCommunity(asha, { name: "Teachers of physics", module: "teaching" }, true);
    expect(teach.module).toBe("teaching");
    expect((await C.listCommunities(kunal, "", "teaching")).discover.map((c) => c.name)).toEqual(["Teachers of physics"]);
    await C.leaveCommunity(kunal, big.id);
    expect((await C.listCommunities(kunal, "", "teaching")).discover.map((c) => c.name)).toEqual(["Teachers of physics", "Everything IAM"]);
    expect((await C.createCommunity(asha, { name: "Odd", module: "../x" }, true)).module).toBe("");
    expect((await C.updateCommunity(asha, teach.id, { module: "" })).module).toBe("");
  });

  it("a discussion can carry a listing from any module: only a public listing page, its module from the path", async () => {
    await join(asha, "Asha Rao");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await expect(C.startDiscussion(asha, c.id, { title: "Look", body: "", about: { page: "https://evil.example/x", title: "x" } }, true)).rejects.toThrow(/public page/);
    const d = await C.startDiscussion(asha, c.id, { title: "Anyone going?", body: "", about: { page: "/s/events/ev_42", title: "  Kubernetes   Day " } }, true);
    expect(d.about).toEqual({ page: "/s/events/ev_42", title: "Kubernetes Day", module: "events" });
    const job = await C.startDiscussion(asha, c.id, { title: "Worth applying?", body: "", about: { page: "/j/job_7", title: "IAM Lead" } }, true);
    expect(job.about?.module).toBe("jobs");
    expect((await C.readDiscussion(asha, d.id)).discussion.about?.page).toBe("/s/events/ev_42");
  });
});

describe("upvote and downvote (owner, 2026-11-22)", () => {
  it("one vote per member, up or down; pressing it again takes it back; only members vote", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(kunal, c.id);
    const d = await C.startDiscussion(asha, c.id, { title: "Passkeys?", body: "" }, true);
    await C.vote(asha, d.id, 1, true);
    await C.vote(kunal, d.id, -1, true);
    await C.vote(kunal, d.id, -1, true); // still one vote
    expect((await C.readDiscussion(kunal, d.id)).discussion).toMatchObject({ score: 0, myVote: -1 });
    await C.vote(kunal, d.id, 1, true);
    expect((await C.readDiscussion(asha, d.id)).discussion).toMatchObject({ score: 2, myVote: 1 });
    await C.vote(kunal, d.id, 0);
    expect((await C.readDiscussion(asha, d.id)).discussion.score).toBe(1);
    await expect(C.vote(rahul, d.id, 1, true)).rejects.toThrow(/Join this community/);
    await expect(C.vote(kunal, d.id, -1)).rejects.toThrow(/Check what goes/);
  });
});
