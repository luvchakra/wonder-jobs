import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/*
 * Every persona's use case through the real API routes: job seeker, Owner, Hiring manager, Recruiter, and
 * someone outside the workspace. Each request runs as whoever `as()` names; storage is the in-memory table
 * backend, push notifications are recorded.
 */
type Actor = { userId: string; tenantId: string; email?: string; name?: string };
let current: Actor | null = null;
vi.mock("@/server/auth", () => ({
  requireSession: async () => current ?? NextResponse.json({ error: "Sign in required" }, { status: 401 }),
}));
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const pushes: { tenant: string; title: string }[] = [];
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async (tenant: string, n: { title: string }) => (pushes.push({ tenant, title: n.title }), { sent: 1 })) }));

import { resetTablesForTests } from "@/server/db/table";
import { SOURCE_FETCHERS } from "@/server/jobs/providers";
import * as hiring from "./route";
import * as workspace from "./[org]/route";
import * as invite from "./invites/[id]/route";
import * as team from "./[org]/team/route";
import * as jobs from "./[org]/jobs/route";
import * as talent from "./[org]/talent/route";
import * as shortlist from "./[org]/shortlist/route";
import * as orgConvs from "./[org]/conversations/route";
import * as myConvs from "../conversations/route";
import * as thread from "../conversations/[id]/route";
import * as me from "../talent/me/route";

/* ---- helpers ------------------------------------------------------------------------------------------------ */
let n = 0;
/** A fresh person per test, so rate-limit buckets never carry over between tests. */
const person = (tag: string, email = true): Actor => {
  const id = `u-${tag}-${++n}`;
  return { userId: id, tenantId: id, email: email ? `${tag}${n}@acme.example` : undefined, name: `${tag[0].toUpperCase()}${tag.slice(1)} Person` };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers each type their own params
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;
async function call(who: Actor | null, handler: Handler, opts: { path?: string; method?: string; body?: unknown; params?: Record<string, string> } = {}) {
  current = who;
  const req = new Request(`http://localhost${opts.path ?? "/api/x"}`, { method: opts.method ?? "GET", headers: { "content-type": "application/json" }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: string } };
}
const ok = async (p: Promise<{ status: number; body: Record<string, unknown> }>) => {
  const r = await p;
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const JOB = { title: "Platform Engineer", location: "Bengaluru", workMode: "hybrid", jobType: "full_time", currency: "INR", description: "Build and run the Kubernetes platform every product team ships on, with a small SRE group.", skills: ["Kubernetes", "Go"], applyUrl: "https://acme.example/careers/platform" };
const PROFILE = { displayName: "Sam S.", headline: "SRE with Kubernetes and Terraform", seniority: "senior", yearsExperience: 7, skills: ["Kubernetes", "Terraform"], locations: ["Bengaluru"], workModes: ["hybrid"], summary: "Looking for platform roles." };

const createWorkspace = (who: Actor, name = "Acme") => ok(call(who, hiring.POST, { method: "POST", body: { name } }));
const postJob = (who: Actor, org: string, job: object = JOB) => call(who, jobs.POST, { method: "POST", body: job, params: { org } });
const setJob = (who: Actor, org: string, id: string, status: string) => call(who, jobs.PATCH, { method: "PATCH", body: { id, status }, params: { org } });
const inviteTo = (who: Actor, org: string, email: string, role: string) => call(who, team.POST, { method: "POST", body: { email, role }, params: { org } });
const answer = (who: Actor, id: string, action: "accept" | "decline") => call(who, invite.POST, { method: "POST", body: { action }, params: { id } });
const optIn = (who: Actor, profile: object = PROFILE) => call(who, me.PUT, { method: "PUT", body: profile });
const search = (who: Actor, org: string, q = "", place = "") => call(who, talent.GET, { path: `/api/hiring/${org}/talent?q=${encodeURIComponent(q)}&place=${encodeURIComponent(place)}`, params: { org } });
const addShort = (who: Actor, org: string, candidate: string, note = "", jobId?: string) => call(who, shortlist.POST, { method: "POST", body: { candidate, note, jobId }, params: { org } });
const markShort = (who: Actor, org: string, id: string, status: string) => call(who, shortlist.PATCH, { method: "PATCH", body: { id, status }, params: { org } });
const listShort = (who: Actor, org: string) => call(who, shortlist.GET, { params: { org } });
const startConv = (who: Actor, org: string, candidate: string, body: string, jobId?: string) => call(who, orgConvs.POST, { method: "POST", body: { candidate, body, jobId }, params: { org } });
const readThread = (who: Actor, id: string, as?: "org") => call(who, thread.GET, { path: `/api/conversations/${id}${as ? "?as=org" : ""}`, params: { id } });
const write = (who: Actor, id: string, body: string, as?: "org") => call(who, thread.POST, { path: `/api/conversations/${id}${as ? "?as=org" : ""}`, method: "POST", body: { body }, params: { id } });
const setConv = (who: Actor, id: string, status: string) => call(who, thread.PATCH, { method: "PATCH", body: { status }, params: { id } });

/** Owner + a hiring manager and a recruiter who accepted their invitations. */
async function company(name = "Acme") {
  const owner = person("owner");
  const manager = person("manager");
  const recruiter = person("recruiter");
  const { org } = await createWorkspace(owner, name);
  for (const [who, role] of [[manager, "hiring_manager"], [recruiter, "recruiter"]] as const) {
    const inv = await ok(inviteTo(owner, org.id, who.email!, role));
    await ok(answer(who, inv.id, "accept"));
  }
  return { orgId: org.id as string, owner, manager, recruiter };
}

/** What the "WonderJobs employers" source returns to a job seeker's search. */
async function employerSearch(query: string) {
  return SOURCE_FETCHERS.employers.fetch({ query, locations: [], workModes: [] } as never);
}

beforeEach(() => {
  resetTablesForTests();
  pushes.length = 0;
  current = null;
});

/* ---- signed out ---------------------------------------------------------------------------------------------- */
describe("signed out", () => {
  it("every hiring and messaging route refuses with 401", async () => {
    const p = { org: "org_x", id: "x" };
    const routes: Handler[] = [hiring.GET, hiring.POST, invite.POST, team.GET, team.POST, team.PATCH, team.DELETE, jobs.GET, jobs.POST, jobs.PATCH, talent.GET, shortlist.GET, shortlist.POST, shortlist.PATCH, shortlist.DELETE, orgConvs.GET, orgConvs.POST, myConvs.GET, thread.GET, thread.POST, thread.PATCH, me.GET, me.PUT, me.DELETE];
    for (const r of routes) expect((await call(null, r, { method: "POST", body: {}, params: p })).status).toBe(401);
  });
});

/* ---- job seeker --------------------------------------------------------------------------------------------- */
describe("job seeker", () => {
  it("is not visible to recruiters until they turn it on, and sees exactly what recruiters see", async () => {
    const { orgId, recruiter } = await company();
    const seeker = person("seeker");
    expect((await ok(call(seeker, me.GET))).profile).toBeNull();
    expect((await ok(search(recruiter, orgId, "Kubernetes"))).matches).toEqual([]);

    const { profile } = await ok(optIn(seeker));
    const [match] = (await ok(search(recruiter, orgId, "Kubernetes"))).matches;
    // The preview the seeker saw is the record recruiters get: same fields, nothing more.
    expect(match.profile).toEqual(profile);
    expect(Object.keys(match.profile).sort()).toEqual(["displayName", "headline", "locations", "seniority", "skills", "summary", "tenantId", "updatedAt", "workModes", "yearsExperience"]);
    expect(JSON.stringify(match)).not.toContain(seeker.email!);
  });

  it("refuses contact-detail fields it doesn't know and caps what it stores", async () => {
    const seeker = person("seeker");
    const { profile } = await ok(optIn(seeker, { ...PROFILE, email: "leak@me.example", phone: "+91 99999 99999", workModes: ["hybrid", "anywhere"] }));
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("phone");
    expect(profile.workModes).toEqual(["hybrid"]);
  });

  it("turning it off hides them from search and stops new and existing conversations from companies", async () => {
    const { orgId, recruiter } = await company();
    const seeker = person("seeker");
    await ok(optIn(seeker));
    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi Sam, a platform role?"));
    await ok(call(seeker, me.DELETE, { method: "DELETE" }));
    expect((await ok(call(seeker, me.GET))).profile).toBeNull();
    expect((await ok(search(recruiter, orgId, "Kubernetes"))).matches).toEqual([]);
    expect((await startConv(recruiter, orgId, seeker.tenantId, "Again?")).status).toBe(404);
    // An existing thread stops too: the company can't keep writing to someone who is no longer open to recruiters.
    expect((await write(recruiter, id, "Still there?", "org")).status).toBe(409);
    expect((await ok(readThread(recruiter, id, "org"))).canSend).toBe(false);
    // The seeker can still read and answer their own thread.
    await ok(readThread(seeker, id));
    await ok(write(seeker, id, "Thanks, not now."));
  });

  it("gets messages from companies, replies, declines, blocks and reopens", async () => {
    const { orgId, recruiter } = await company("Globex");
    const seeker = person("seeker");
    await ok(optIn(seeker));
    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi Sam, would you talk about a platform role?"));
    expect(pushes.some((p) => p.tenant === seeker.tenantId)).toBe(true);

    const inbox = (await ok(call(seeker, myConvs.GET))).conversations;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ id, orgName: "Globex", status: "open" });
    expect(inbox[0].last.body).toMatch(/platform role/);

    const t = await ok(readThread(seeker, id));
    expect(t).toMatchObject({ side: "candidate", canSend: true });
    await ok(write(seeker, id, "Happy to talk."));
    expect(pushes.some((p) => p.tenant === recruiter.tenantId)).toBe(true);

    // Not interested: the company can no longer write.
    await ok(setConv(seeker, id, "declined"));
    expect((await write(recruiter, id, "Are you sure?", "org")).status).toBe(409);
    expect((await ok(readThread(recruiter, id, "org"))).canSend).toBe(false);
    // Writing back reopens it.
    await ok(write(seeker, id, "Actually, tell me more."));
    expect((await ok(readThread(seeker, id))).conversation.status).toBe("open");
    await ok(write(recruiter, id, "Great, here are the details.", "org"));

    // Block: nobody writes, and the company can't start a new conversation either.
    await ok(setConv(seeker, id, "blocked"));
    expect((await write(recruiter, id, "Hello?", "org")).status).toBe(409);
    expect((await startConv(recruiter, orgId, seeker.tenantId, "New thread")).status).toBe(409);
    expect((await write(seeker, id, "Oops")).status).toBe(409);
    expect((await ok(readThread(seeker, id))).canSend).toBe(false);

    // Open again.
    await ok(setConv(seeker, id, "open"));
    await ok(write(recruiter, id, "Thanks for reopening.", "org"));
    const msgs = (await ok(readThread(seeker, id))).messages;
    expect(msgs.map((m: { side: string }) => m.side)).toEqual(["org", "candidate", "candidate", "org", "org"]);
  });

  it("only the candidate changes a conversation's status", async () => {
    const { orgId, recruiter, owner } = await company();
    const seeker = person("seeker");
    await ok(optIn(seeker));
    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hello"));
    for (const who of [recruiter, owner]) expect((await setConv(who, id, "declined")).status).toBeGreaterThanOrEqual(400);
    expect((await ok(readThread(seeker, id))).conversation.status).toBe("open");
  });

  it("an open employer job shows up in a job seeker's search; a draft or closed one doesn't", async () => {
    const { orgId, owner } = await company("Initech");
    const { id } = await ok(postJob(owner, orgId));
    expect(await employerSearch("platform engineer")).toEqual([]);
    await ok(setJob(owner, orgId, id, "open"));
    const [found] = await employerSearch("platform engineer");
    expect(found).toMatchObject({ title: "Platform Engineer", company: "Initech", location: "Bengaluru", applyUrl: JOB.applyUrl });
    expect(found.description).toMatch(/hasn't verified yet/);
    expect(await employerSearch("data scientist")).toEqual([]);
    await ok(setJob(owner, orgId, id, "closed"));
    expect(await employerSearch("platform engineer")).toEqual([]);
  });
});

/* ---- owner -------------------------------------------------------------------------------------------------- */
describe("employer (Owner)", () => {
  it("creates a workspace and becomes its Owner; a bad name is refused", async () => {
    const owner = person("owner");
    expect((await call(owner, hiring.POST, { method: "POST", body: { name: "A" } })).status).toBe(400);
    expect((await ok(call(owner, hiring.GET))).workspaces).toEqual([]);
    const { org, role } = await createWorkspace(owner, "Acme");
    expect(role).toBe("owner");
    expect(org).toMatchObject({ name: "Acme", verified: false });
    const mine = await ok(call(owner, hiring.GET));
    expect(mine.workspaces).toEqual([{ org, role: "owner" }]);
  });

  it("changes the company's name and website; open jobs show the new name; only an Owner can", async () => {
    const { orgId, owner, manager, recruiter } = await company("Acme");
    const job = await ok(postJob(owner, orgId));
    await ok(setJob(owner, orgId, job.id, "open"));
    const rename = (who: Actor, body: object) => call(who, workspace.PATCH, { method: "PATCH", body, params: { org: orgId } });
    for (const who of [manager, recruiter, person("outsider")]) expect((await rename(who, { name: "Hijacked" })).status).toBe(403);
    expect((await rename(owner, { name: "A" })).status).toBe(400);
    expect((await rename(owner, { name: "Acme Homes", website: "not a site" })).status).toBe(400);
    const org = await ok(rename(owner, { name: "Acme Homes", website: "acmehomes.example" }));
    expect(org).toMatchObject({ name: "Acme Homes", website: "https://acmehomes.example", verified: false });
    expect((await ok(call(manager, hiring.GET))).workspaces[0].org.name).toBe("Acme Homes");
    const [found] = await employerSearch("platform engineer");
    expect(found).toMatchObject({ company: "Acme Homes", companyDomain: "acmehomes.example" });
    // Clearing the website is allowed.
    expect((await ok(rename(owner, { name: "Acme Homes", website: "" }))).website).toBeUndefined();
  });

  it("posts a job as a draft, edits it, opens and closes it", async () => {
    const { orgId, owner } = await company();
    const job = await ok(postJob(owner, orgId));
    expect(job.status).toBe("draft");
    const listed = (await ok(call(owner, jobs.GET, { params: { org: orgId } }))).jobs;
    expect(listed.map((j: { id: string }) => j.id)).toEqual([job.id]);
    const edited = await ok(call(owner, jobs.PATCH, { method: "PATCH", body: { id: job.id, job: { ...JOB, title: "Senior Platform Engineer" } }, params: { org: orgId } }));
    expect(edited).toMatchObject({ title: "Senior Platform Engineer", status: "draft" });
    await ok(setJob(owner, orgId, job.id, "open"));
    await ok(setJob(owner, orgId, job.id, "closed"));
    expect((await ok(call(owner, jobs.GET, { params: { org: orgId } }))).jobs[0].status).toBe("closed");
  });

  it("is told what a job is missing, and where to apply can be typed plainly", async () => {
    const { orgId, owner } = await company();
    const cases: [object, RegExp][] = [
      [{ ...JOB, title: "" }, /title/],
      [{ ...JOB, location: " " }, /where the job is/],
      [{ ...JOB, description: "Too short." }, /more characters/],
      [{ ...JOB, applyUrl: "" }, /where to apply/],
      [{ ...JOB, applyUrl: "javascript:alert(1)" }, /where to apply/],
      [{ ...JOB, salaryMin: 50, salaryMax: 10 }, /lowest salary/],
    ];
    for (const [job, msg] of cases) {
      const r = await postJob(owner, orgId, job);
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(msg);
    }
    expect((await ok(postJob(owner, orgId, { ...JOB, applyUrl: "acme.example/careers" }))).applyUrl).toBe("https://acme.example/careers");
    expect((await ok(postJob(owner, orgId, { ...JOB, title: "SRE", applyUrl: "jobs@acme.example" }))).applyUrl).toBe("mailto:jobs@acme.example");
  });

  it("invites by email with a role; only that email can join; re-inviting a member is refused", async () => {
    const owner = person("owner");
    const { org } = await createWorkspace(owner);
    const recruiter = person("recruiter");
    const stranger = person("stranger");
    expect((await inviteTo(owner, org.id, "not-an-email", "recruiter")).status).toBe(400);
    expect((await inviteTo(owner, org.id, owner.email!, "recruiter")).status).toBe(409); // can't invite yourself
    const inv = await ok(inviteTo(owner, org.id, recruiter.email!.toUpperCase(), "recruiter"));

    // The owner sees the pending invitation; the invitee sees it under Hiring.
    expect((await ok(call(owner, team.GET, { params: { org: org.id } }))).invites).toHaveLength(1);
    const waiting = (await ok(call(recruiter, hiring.GET))).invites;
    expect(waiting).toEqual([expect.objectContaining({ id: inv.id, orgName: "Acme", role: "recruiter" })]);
    expect((await ok(call(stranger, hiring.GET))).invites).toEqual([]);

    // Someone else can't use it, and nor can an account with no email.
    expect((await answer(stranger, inv.id, "accept")).status).toBe(404);
    expect((await answer(person("noemail", false), inv.id, "accept")).status).toBe(403);
    const joined = await ok(answer(recruiter, inv.id, "accept"));
    expect(joined.role).toBe("recruiter");
    expect((await ok(call(recruiter, hiring.GET))).workspaces).toEqual([expect.objectContaining({ role: "recruiter" })]);
    expect((await inviteTo(owner, org.id, recruiter.email!, "hiring_manager")).status).toBe(409);
  });

  it("a declined or withdrawn invitation can't be used", async () => {
    const owner = person("owner");
    const { org } = await createWorkspace(owner);
    const a = person("a");
    const b = person("b");
    const invA = await ok(inviteTo(owner, org.id, a.email!, "recruiter"));
    await ok(answer(a, invA.id, "decline"));
    expect((await answer(a, invA.id, "accept")).status).toBe(404);
    const invB = await ok(inviteTo(owner, org.id, b.email!, "recruiter"));
    await ok(call(owner, team.DELETE, { path: `/api/x?invite=${invB.id}`, method: "DELETE", params: { org: org.id } }));
    expect((await answer(b, invB.id, "accept")).status).toBe(404);
  });

  it("changes roles and removes people, but a workspace always keeps an owner", async () => {
    const { orgId, owner, manager, recruiter } = await company();
    await ok(call(owner, team.PATCH, { method: "PATCH", body: { tenantId: recruiter.tenantId, role: "hiring_manager" }, params: { org: orgId } }));
    expect((await ok(call(recruiter, hiring.GET))).workspaces[0].role).toBe("hiring_manager");
    expect((await call(owner, team.PATCH, { method: "PATCH", body: { tenantId: owner.tenantId, role: "recruiter" }, params: { org: orgId } })).status).toBe(409);
    expect((await call(owner, team.DELETE, { path: `/api/x?tenant=${owner.tenantId}`, method: "DELETE", params: { org: orgId } })).status).toBe(409);
    await ok(call(owner, team.DELETE, { path: `/api/x?tenant=${manager.tenantId}`, method: "DELETE", params: { org: orgId } }));
    expect((await ok(call(manager, hiring.GET))).workspaces).toEqual([]);
    expect((await call(manager, jobs.GET, { params: { org: orgId } })).status).toBe(403);
    // Anyone can leave on their own.
    await ok(call(recruiter, team.DELETE, { path: `/api/x?tenant=${recruiter.tenantId}`, method: "DELETE", params: { org: orgId } }));
    expect((await ok(call(owner, team.GET, { params: { org: orgId } }))).members).toHaveLength(1);
  });

  it("can do everything a recruiter and a hiring manager can", async () => {
    const { orgId, owner } = await company();
    const seeker = person("seeker");
    await ok(optIn(seeker));
    expect((await ok(search(owner, orgId, "kubernetes"))).matches).toHaveLength(1);
    const entry = await ok(addShort(owner, orgId, seeker.tenantId));
    await ok(markShort(owner, orgId, entry.id, "reported"));
    await ok(markShort(owner, orgId, entry.id, "interview"));
    await ok(startConv(owner, orgId, seeker.tenantId, "Hello from the owner"));
  });
});

/* ---- hiring manager ----------------------------------------------------------------------------------------- */
describe("hiring manager", () => {
  it("posts and edits jobs, reads messages, and decides Interview or Pass on reported candidates", async () => {
    const { orgId, manager, recruiter } = await company();
    const job = await ok(postJob(manager, orgId));
    await ok(setJob(manager, orgId, job.id, "open"));

    const seeker = person("seeker");
    await ok(optIn(seeker));
    const entry = await ok(addShort(recruiter, orgId, seeker.tenantId, "Strong on Kubernetes", job.id));
    await ok(markShort(recruiter, orgId, entry.id, "reported"));
    const [seen] = (await ok(listShort(manager, orgId))).entries;
    expect(seen).toMatchObject({ status: "reported", note: "Strong on Kubernetes", jobTitle: "Platform Engineer", candidate: { displayName: "Sam S." } });
    await ok(markShort(manager, orgId, entry.id, "interview"));
    await ok(markShort(manager, orgId, entry.id, "passed"));
    expect((await ok(listShort(manager, orgId))).entries[0].status).toBe("passed");

    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi Sam"));
    expect((await ok(call(manager, orgConvs.GET, { params: { org: orgId } }))).conversations).toHaveLength(1);
    const t = await ok(readThread(manager, id, "org"));
    expect(t).toMatchObject({ side: "org", canSend: false });
  });

  it("can't search talent, shortlist, report, write to candidates or manage the team", async () => {
    const { orgId, manager, recruiter, owner } = await company();
    const seeker = person("seeker");
    await ok(optIn(seeker));
    expect((await search(manager, orgId, "kubernetes")).status).toBe(403);
    expect((await addShort(manager, orgId, seeker.tenantId)).status).toBe(403);
    const entry = await ok(addShort(recruiter, orgId, seeker.tenantId));
    expect((await markShort(manager, orgId, entry.id, "reported")).status).toBe(403);
    expect((await startConv(manager, orgId, seeker.tenantId, "Hi")).status).toBe(403);
    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi"));
    expect((await write(manager, id, "Me too", "org")).status).toBe(403);
    expect((await inviteTo(manager, orgId, "x@acme.example", "recruiter")).status).toBe(403);
    expect((await call(manager, team.PATCH, { method: "PATCH", body: { tenantId: recruiter.tenantId, role: "owner" }, params: { org: orgId } })).status).toBe(403);
    // Sees the team but not who's been invited.
    await ok(inviteTo(owner, orgId, "y@acme.example", "recruiter"));
    expect((await ok(call(manager, team.GET, { params: { org: orgId } }))).invites).toEqual([]);
  });
});

/* ---- recruiter ---------------------------------------------------------------------------------------------- */
describe("recruiter", () => {
  it("searches only job seekers open to recruiters, by words and place", async () => {
    const { orgId, recruiter } = await company();
    const sam = person("sam");
    const ria = person("ria");
    const ana = person("ana");
    await ok(optIn(sam));
    await ok(optIn(ria, { ...PROFILE, displayName: "Ria R.", headline: "Data analyst", skills: ["SQL", "Python"], locations: ["Pune"], workModes: ["onsite"] }));
    await ok(optIn(ana, { ...PROFILE, displayName: "Ana A.", headline: "Platform engineer", skills: ["Kubernetes"], locations: ["Lisbon"], workModes: ["remote"] }));
    person("hidden"); // a job seeker who never turned it on

    const names = async (q: string, place = "") => (await ok(search(recruiter, orgId, q, place))).matches.map((m: { profile: { displayName: string } }) => m.profile.displayName).sort();
    expect(await names("")).toEqual(["Ana A.", "Ria R.", "Sam S."]);
    expect(await names("kubernetes")).toEqual(["Ana A.", "Sam S."]);
    expect(await names("sql python")).toEqual(["Ria R."]);
    expect(await names("kubernetes", "Bengaluru")).toEqual(["Ana A.", "Sam S."]); // Ana is remote: open to Bengaluru
    expect(await names("", "Pune")).toEqual(["Ana A.", "Ria R."]);
    expect(await names("cobol")).toEqual([]);
  });

  it("shortlists, reports and messages, but can't post jobs or decide", async () => {
    const { orgId, recruiter, owner } = await company();
    const job = await ok(postJob(owner, orgId));
    const seeker = person("seeker");
    await ok(optIn(seeker));

    const entry = await ok(addShort(recruiter, orgId, seeker.tenantId, "Great fit", job.id));
    expect(entry.status).toBe("shortlisted");
    expect((await addShort(recruiter, orgId, seeker.tenantId, "again", job.id)).status).toBe(409);
    await ok(markShort(recruiter, orgId, entry.id, "reported"));
    expect((await markShort(recruiter, orgId, entry.id, "interview")).status).toBe(403);
    expect((await markShort(recruiter, orgId, entry.id, "passed")).status).toBe(403);

    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi Sam, about the platform role", job.id));
    await ok(write(recruiter, id, "Here's the job link.", "org"));
    expect((await ok(readThread(recruiter, id, "org"))).conversation.jobTitle).toBe("Platform Engineer");

    expect((await postJob(recruiter, orgId)).status).toBe(403);
    expect((await setJob(recruiter, orgId, job.id, "open")).status).toBe(403);
    expect((await inviteTo(recruiter, orgId, "z@acme.example", "recruiter")).status).toBe(403);
    // Can see the jobs to pick one when shortlisting.
    expect((await ok(call(recruiter, jobs.GET, { params: { org: orgId } }))).jobs).toHaveLength(1);
  });

  it("can't shortlist or message someone not open to recruiters, or tie them to another company's job", async () => {
    const { orgId, recruiter } = await company();
    const other = await company("Other Co");
    const otherJob = await ok(postJob(other.owner, other.orgId));
    const hidden = person("hidden");
    expect((await addShort(recruiter, orgId, hidden.tenantId)).status).toBe(404);
    expect((await startConv(recruiter, orgId, hidden.tenantId, "Hi")).status).toBe(404);
    const seeker = person("seeker");
    await ok(optIn(seeker));
    expect((await addShort(recruiter, orgId, seeker.tenantId, "", otherJob.id)).status).toBe(404);
    expect((await startConv(recruiter, orgId, seeker.tenantId, "Hi", otherJob.id)).status).toBe(404);
    expect((await startConv(recruiter, orgId, seeker.tenantId, "   ")).status).toBe(400);
  });
});

/* ---- isolation ---------------------------------------------------------------------------------------------- */
describe("outside the workspace", () => {
  it("someone not in a workspace can't see or change anything in it", async () => {
    const { orgId, owner, recruiter } = await company();
    const outsider = person("outsider");
    const job = await ok(postJob(owner, orgId));
    const seeker = person("seeker");
    await ok(optIn(seeker));
    const entry = await ok(addShort(recruiter, orgId, seeker.tenantId));
    const { id } = await ok(startConv(recruiter, orgId, seeker.tenantId, "Hi"));
    const p = { params: { org: orgId } };
    for (const r of [call(outsider, jobs.GET, p), call(outsider, team.GET, p), search(outsider, orgId), listShort(outsider, orgId), call(outsider, orgConvs.GET, p), postJob(outsider, orgId), setJob(outsider, orgId, job.id, "open"), markShort(outsider, orgId, entry.id, "passed"), addShort(outsider, orgId, seeker.tenantId), inviteTo(outsider, orgId, "me@x.example", "owner")]) {
      expect((await r).status).toBe(403);
    }
    expect((await readThread(outsider, id)).status).toBe(404);
    expect((await readThread(outsider, id, "org")).status).toBe(404);
    expect((await write(outsider, id, "hi")).status).toBe(404);
  });

  it("a member of one company can't reach another company's data", async () => {
    const a = await company("A Co");
    const b = await company("B Co");
    const jobB = await ok(postJob(b.owner, b.orgId));
    expect((await call(a.owner, jobs.GET, { params: { org: b.orgId } })).status).toBe(403);
    // Editing B's job through A's workspace finds nothing.
    expect((await setJob(a.owner, a.orgId, jobB.id, "open")).status).toBe(404);
    expect((await call(a.owner, jobs.PATCH, { method: "PATCH", body: { id: jobB.id, job: JOB }, params: { org: a.orgId } })).status).toBe(404);
    const seeker = person("seeker");
    await ok(optIn(seeker));
    const entryB = await ok(addShort(b.recruiter, b.orgId, seeker.tenantId));
    expect((await markShort(a.owner, a.orgId, entryB.id, "passed")).status).toBe(404);
    const { id } = await ok(startConv(b.recruiter, b.orgId, seeker.tenantId, "Hi from B"));
    expect((await readThread(a.recruiter, id, "org")).status).toBe(404);
    expect((await ok(call(a.owner, orgConvs.GET, { params: { org: a.orgId } }))).conversations).toEqual([]);
  });
});

/* ---- several workspaces, and the full walk-through ---------------------------------------------------------- */
describe("several workspaces", () => {
  it("lists every workspace a person belongs to, with their role in each", async () => {
    const person1 = person("both");
    const a = await createWorkspace(person1, "First Co");
    const other = person("owner");
    const { org } = await createWorkspace(other, "Second Co");
    const inv = await ok(inviteTo(other, org.id, person1.email!, "recruiter"));
    await ok(answer(person1, inv.id, "accept"));
    const mine = (await ok(call(person1, hiring.GET))).workspaces;
    expect(mine.map((w: { org: { name: string }; role: string }) => `${w.org.name}:${w.role}`).sort()).toEqual(["First Co:owner", "Second Co:recruiter"]);
    expect(a.role).toBe("owner");
  });

  it("someone who is both a recruiter and a job seeker reads each thread from the side they open it on", async () => {
    const { orgId, owner } = await company();
    await ok(optIn(owner));
    const { id } = await ok(startConv(owner, orgId, owner.tenantId, "Testing my own profile"));
    expect((await ok(readThread(owner, id))).side).toBe("candidate");
    expect((await ok(readThread(owner, id, "org"))).side).toBe("org");
  });
});

describe("walk-through: Owner, Recruiter, Hiring manager and a job seeker", () => {
  it("runs the whole flow end to end", async () => {
    const A = person("owner");
    const B = person("recruiter");
    const C = person("manager");
    const D = person("seeker");
    // 1. A creates the workspace, posts a job and opens it.
    const { org } = await createWorkspace(A, "WonderHome");
    const job = await ok(postJob(A, org.id, { ...JOB, applyUrl: "wonderhome.example/careers" }));
    await ok(setJob(A, org.id, job.id, "open"));
    expect((await employerSearch("platform engineer"))[0]).toMatchObject({ company: "WonderHome", applyUrl: "https://wonderhome.example/careers" });
    // 2. A invites B as Recruiter and C as Hiring manager; they join.
    for (const [who, role] of [[B, "recruiter"], [C, "hiring_manager"]] as const) {
      const inv = await ok(inviteTo(A, org.id, who.email!, role));
      const [waiting] = (await ok(call(who, hiring.GET))).invites;
      expect(waiting.id).toBe(inv.id);
      await ok(answer(who, inv.id, "accept"));
    }
    const team1 = (await ok(call(A, team.GET, { params: { org: org.id } }))).members;
    expect(team1.map((m: { role: string }) => m.role).sort()).toEqual(["hiring_manager", "owner", "recruiter"]);
    // 3. D turns on You → Recruiters.
    await ok(optIn(D));
    // 4. B finds D, shortlists, reports and messages.
    const [match] = (await ok(search(B, org.id, "kubernetes", "Bengaluru"))).matches;
    expect(match.profile.tenantId).toBe(D.tenantId);
    const entry = await ok(addShort(B, org.id, D.tenantId, "7 years of Kubernetes", job.id));
    await ok(markShort(B, org.id, entry.id, "reported"));
    const { id } = await ok(startConv(B, org.id, D.tenantId, "Hi Sam, WonderHome is hiring a Platform Engineer.", job.id));
    // 5. C decides Interview; D replies.
    expect((await ok(listShort(C, org.id))).entries[0].status).toBe("reported");
    await ok(markShort(C, org.id, entry.id, "interview"));
    const inbox = (await ok(call(D, myConvs.GET))).conversations;
    expect(inbox[0]).toMatchObject({ orgName: "WonderHome", jobTitle: "Platform Engineer" });
    await ok(write(D, id, "Yes, I'd like to interview."));
    const seenByC = await ok(readThread(C, id, "org"));
    expect(seenByC.messages.map((m: { body: string }) => m.body)).toEqual(["Hi Sam, WonderHome is hiring a Platform Engineer.", "Yes, I'd like to interview."]);
    expect((await ok(listShort(A, org.id))).entries[0].status).toBe("interview");
  });
});
