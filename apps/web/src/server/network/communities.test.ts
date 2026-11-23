import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const told = vi.hoisted(() => [] as { tenant: string; title: string }[]);
vi.mock("../notifications/deliver", () => ({ deliver: vi.fn(async (tenant: string, n: { title: string }) => (told.push({ tenant, title: n.title }), { pushed: 0, emailed: false })) }));

import type { Session } from "../auth";
import { resetTablesForTests, table } from "../db/table";
import * as N from "./network";
import * as C from "./communities";
import * as S from "./social";
import { listingPreview } from "./preview";
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

  it("moderators act within their permissions; a ban keeps them out; the last owner can't just leave", async () => {
    await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const rahulId = await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(kunal, c.id);
    await C.joinCommunity(rahul, c.id);
    await expect(C.actOnMember(kunal, c.id, rahulId, "remove")).rejects.toThrow(/moderators/);
    // Invited to moderate with Members only: a moderator once they accept.
    await C.setModerator(asha, c.id, kunalId, ["members"]);
    expect((await C.getCommunity(kunal, c.id)).me).toMatchObject({ role: "member", modInvite: ["members"] });
    expect(told.some((t) => t.tenant === "u-kunal" && /invited to moderate/.test(t.title))).toBe(true);
    expect((await C.answerModInvite(kunal, c.id, true)).me).toMatchObject({ role: "moderator", perms: ["members"] });
    await expect(C.setModerator(kunal, c.id, rahulId, ["posts"])).rejects.toThrow(/Everything/);
    await expect(C.updateCommunity(kunal, c.id, { name: "Renamed" })).rejects.toThrow(/settings/);
    await C.actOnMember(kunal, c.id, rahulId, "ban", { days: 7, reason: "Spam" });
    expect(told.some((t) => t.tenant === "u-rahul" && /banned from Identity people for 7 days: Spam/.test(t.title))).toBe(true);
    await expect(C.getCommunity(rahul, c.id)).rejects.toThrow(/isn't available/);
    expect((await C.communityMembers(kunal, c.id)).banned.map((m) => m.member.id)).toEqual([rahulId]);
    await C.actOnMember(kunal, c.id, rahulId, "unban");
    expect((await C.getCommunity(rahul, c.id)).me).toBeNull();
    // Settings too, then step down to a member.
    await C.setModerator(asha, c.id, kunalId, ["members", "settings"]);
    await C.updateCommunity(kunal, c.id, { name: "Identity folk" });
    expect((await C.stepDown(kunal, c.id)).me?.role).toBe("member");
    await expect(C.leaveCommunity(asha, c.id)).rejects.toThrow(/only owner/);
    await C.actOnMember(asha, c.id, kunalId, "make_owner");
    await C.leaveCommunity(asha, c.id);
    expect((await C.getCommunity(kunal, c.id)).me?.role).toBe("owner");
    const log = await C.modLog(kunal, c.id);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["Invited to moderate", "Became a moderator", "Banned", "Lifted a ban", "Stepped down as moderator", "Made someone owner"]));
  });

  it("a ban for a time ends by itself", async () => {
    await join(asha, "Asha Rao");
    const rahulId = await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(rahul, c.id);
    await C.actOnMember(asha, c.id, rahulId, "ban", { days: 1 });
    await table<{ community_id: string; tenant_id: string; banned_until: string }>("network_community_members").update({ community_id: c.id, tenant_id: "u-rahul" }, { banned_until: new Date(Date.now() - 1000).toISOString() });
    expect((await C.getCommunity(rahul, c.id)).me).toBeNull();
    expect((await C.joinCommunity(rahul, c.id)).me?.status).toBe("member");
  });

  it("moderators add members only from their connections, who join with one press or decline", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const rahulId = await join(rahul, "Rahul Sen");
    await N.requestConnection(asha, kunalId, {}, true);
    const inbox = await N.myNetwork(kunal);
    await N.actOnConnection(kunal, inbox.invitations[0]!.connectionId!, "accept");
    const c = await C.createCommunity(asha, { name: "Bank CISOs", visibility: "private", joinPolicy: "approval" }, true);
    expect((await C.inviteCandidates(asha, c.id)).map((p) => p.id)).toEqual([kunalId]);
    await expect(C.inviteMembers(rahul, c.id, [kunalId], true)).rejects.toThrow(/moderators/);
    expect(await C.inviteMembers(asha, c.id, [kunalId, rahulId], true)).toEqual({ invited: 1 }); // Rahul isn't a connection
    expect(told.some((t) => t.tenant === "u-kunal" && /Asha Rao invited you to join Bank CISOs/.test(t.title))).toBe(true);
    expect((await C.getCommunity(kunal, c.id)).me).toMatchObject({ status: "invited" });
    expect((await C.communityMembers(asha, c.id)).invited.map((m) => m.member.id)).toEqual([kunalId]);
    expect(await C.inviteCandidates(asha, c.id)).toEqual([]);
    // Joining accepts, though the community approves members.
    expect((await C.joinCommunity(kunal, c.id)).me?.status).toBe("member");
    expect(ashaId).toBeTruthy();
  });
});

describe("AutoMod and the mod queue", () => {
  it("erasing an account leaves no report, invitation or log line naming them", async () => {
    await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    for (const x of [kunal, rahul]) await C.joinCommunity(x, c.id);
    await C.setModerator(asha, c.id, kunalId, ["everything"]);
    await C.answerModInvite(kunal, c.id, true);
    const d = await C.startDiscussion(rahul, c.id, { title: "Hello", body: "" }, true);
    await C.reportPost(kunal, d.id, "Spam");
    await C.moderate(kunal, d.id, { pinned: true });
    await C.eraseCommunities("u-kunal");
    const rows = [...(await table("network_community_reports").find({ community_id: c.id })), ...(await table("network_mod_log").find({ community_id: c.id }))];
    expect(JSON.stringify(rows)).not.toContain("u-kunal");
    expect((await C.modLog(asha, c.id)).length).toBeGreaterThan(0); // what was done stays, without who
  });

  it("holds a new member's link for review; a moderator approves it and it goes live", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(kunal, c.id);
    const d = await C.startDiscussion(kunal, c.id, { title: "Cheap licences", body: "Buy at https://example.com" }, true);
    expect(d.state).toBe("held");
    expect((await C.listDiscussions(kunal, c.id)).map((x) => x.state)).toEqual(["held"]); // the author sees it, marked
    await join(rahul, "Rahul Sen");
    expect(await C.listDiscussions(rahul, c.id)).toEqual([]); // others don't
    await expect(C.readDiscussion(rahul, d.id)).rejects.toThrow(/isn't available/);
    const q = await C.modQueue(asha, c.id);
    expect(q).toMatchObject([{ id: d.id, kind: "discussion", state: "held" }]);
    expect((await C.getCommunity(asha, c.id)).queue).toBe(1);
    await C.modReview(asha, d.id, "approve");
    expect((await C.listDiscussions(rahul, c.id)).map((x) => x.title)).toEqual(["Cheap licences"]);
    expect(told.some((t) => t.tenant === "u-kunal" && /was approved/.test(t.title))).toBe(true);
    expect((await C.modLog(asha, c.id)).map((l) => [l.automod, l.action])).toEqual([[false, "Approved"], [true, "Held for review"]]);
  });

  it("removes posts with a watched word when told to; moderators change its rules", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    await C.joinCommunity(kunal, c.id);
    await expect(C.setAutoMod(kunal, c.id, { blockedWords: ["casino"] })).rejects.toThrow(/settings/);
    expect(await C.setAutoMod(asha, c.id, { blockedWords: ["casino"], blockedAction: "remove", newMemberDays: 0 })).toMatchObject({ blockedWords: ["casino"], blockedAction: "remove" });
    const d = await C.startDiscussion(asha, c.id, { title: "Welcome", body: "" }, true);
    const r = await C.replyTo(kunal, d.id, { body: "Visit my casino" }, true);
    expect(r.state).toBe("removed");
    // The tree keeps its place for others, without the words.
    expect((await C.readDiscussion(asha, d.id)).replies[0]).toMatchObject({ body: "Visit my casino", state: "removed" }); // a moderator sees it
    await join(rahul, "Rahul Sen");
    expect((await C.readDiscussion(rahul, d.id)).replies[0]).toMatchObject({ body: "", author: null, state: "removed" });
    expect((await C.readDiscussion(rahul, d.id)).discussion.replies).toBe(0);
  });

  it("holds what enough members report; a moderator removes it with a reason its author is told", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const c = await C.createCommunity(asha, { name: "Identity people" }, true);
    for (const x of [kunal, rahul]) await C.joinCommunity(x, c.id);
    await C.setAutoMod(asha, c.id, { reportsToHold: 2, newMemberDays: 0 });
    const d = await C.startDiscussion(kunal, c.id, { title: "Off topic", body: "Hello" }, true);
    await C.reportPost(rahul, d.id, "Off topic");
    expect((await C.modQueue(asha, c.id))[0]).toMatchObject({ state: "live", reports: 1, reasons: ["Off topic"] });
    await C.reportPost(asha, d.id, "Spam");
    expect((await C.modQueue(asha, c.id))[0]).toMatchObject({ state: "held", reports: 2, why: "Reported by 2 members" });
    await C.removePost(asha, d.id, "Rule 2: stay on topic");
    expect(told.some((t) => t.tenant === "u-kunal" && /was removed: Rule 2: stay on topic/.test(t.title))).toBe(true);
    expect((await C.listDiscussions(kunal, c.id))[0]).toMatchObject({ state: "removed", why: "Rule 2: stay on topic" });
    expect(await C.modQueue(asha, c.id)).toEqual([]);
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
    await C.removePost(asha, r.id, "Be kind"); // a moderator removes it: others lose its words, the reply under it stays
    read = await C.readDiscussion(kunal, d.id);
    expect(read.replies.map((x) => [x.state ?? "live", x.body, x.author?.name ?? null, x.parentId])).toEqual([
      ["removed", "", null, null],
      ["live", "Welcome", "Kunal Chakraborty", r.id],
    ]);
    // Its author still sees it, with why.
    expect((await C.readDiscussion(rahul, d.id)).replies[0]).toMatchObject({ state: "removed", body: "Hi everyone", why: "Be kind" });
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

describe("sharing a community", () => {
  it("shows a public one's card on the open web, never a private one's; a post can carry either", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const pub = await C.createCommunity(asha, { name: "Identity people", about: "IAM practitioners" }, true);
    const priv = await C.createCommunity(asha, { name: "Bank CISOs", about: "Invite only", visibility: "private" }, true);
    expect(await C.communityCard(pub.id, true)).toMatchObject({ name: "Identity people", about: "IAM practitioners", members: 1, visibility: "public" });
    expect(await C.communityCard(priv.id, true)).toBeNull();
    expect(JSON.stringify(await C.communityCard(pub.id))).not.toContain("u-asha"); // never who is in it
    expect(await listingPreview(`/app/network/communities/${pub.id}`)).toMatchObject({ title: "Identity people", by: "Community", facts: "Public · 1 member · 0 discussions", image: "" });
    await S.publishPost(asha, { text: "Come join us", audience: "everyone", about: { page: `/app/network/communities/${pub.id}`, title: "Identity people" } } as never, true);
    const [post] = await S.feedFor(asha);
    expect(post).toMatchObject({ href: `/app/network/communities/${pub.id}`, about: "Identity people", module: "" });
    await expect(S.publishPost(asha, { text: "x", audience: "everyone", about: { page: "/app/network/people", title: "x" } } as never, true)).rejects.toThrow(/community/);
    // Into a discussion too.
    const d = await C.startDiscussion(asha, pub.id, { title: "Sister community", body: "", about: { page: `/app/network/communities/${priv.id}`, title: "Bank CISOs" } }, true);
    expect(d.about).toEqual({ page: `/app/network/communities/${priv.id}`, title: "Bank CISOs", module: "" });
  });
});

describe("a community's photo", () => {
  const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0x00, 0x08]), Buffer.from("GPS!!!"), Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9])]);
  it("its settings moderators set and remove it; the network sees it, the open web only a public one's", async () => {
    await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const pub = await C.createCommunity(asha, { name: "Identity people" }, true);
    const priv = await C.createCommunity(asha, { name: "Bank CISOs", visibility: "private" }, true);
    await C.joinCommunity(kunal, pub.id);
    await expect(C.setCommunityPhoto(kunal, pub.id, jpeg(), "image/jpeg")).rejects.toThrow(/owner/);
    await expect(C.setCommunityPhoto(asha, pub.id, Buffer.from("%PDF-1.4"), "application/pdf")).rejects.toThrow(/JPEG, PNG or WebP/);
    const after = await C.setCommunityPhoto(asha, pub.id, jpeg(), "image/jpeg");
    expect(after.photo).toMatch(new RegExp(`^/api/network/communities/${pub.id}/photo\\?v=\\d+$`));
    const p = await C.memberCommunityPhoto(kunal, pub.id);
    expect(p?.mime).toBe("image/jpeg");
    expect(p?.bytes.includes(Buffer.from("GPS!!!"))).toBe(false); // its metadata is gone
    expect(await C.communityPhoto(pub.id, true)).not.toBeNull();
    await C.setCommunityPhoto(asha, priv.id, jpeg(), "image/jpeg");
    expect(await C.memberCommunityPhoto(kunal, priv.id)).not.toBeNull(); // on the network, as its name
    expect(await C.communityPhoto(priv.id, true)).toBeNull(); // never off it
    expect((await C.removeCommunityPhoto(asha, pub.id)).photo).toBeUndefined();
    expect(await C.memberCommunityPhoto(kunal, pub.id)).toBeNull();
  });
});
