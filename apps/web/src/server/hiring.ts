/**
 * Hiring workspaces (owner, 2026-10-20): companies, their members and roles, job listings, recruiters' shortlists
 * and reports, and messages between a company and a job seeker. Every function takes the caller's session and
 * checks, here on the server, that they belong to the organization and that their role allows the action
 * (`domain/org/permissions.ts`); a missing membership or role can do nothing. Every query names the organization
 * or tenant it is scoped to (RLS has no policies — CLAUDE.md).
 *
 * Two reads cross tenants by design and only these: open job listings (they're public postings), and talent
 * profiles, which exist only while a job seeker chose to be open to recruiters and hold only what they saw.
 */
import { randomUUID } from "node:crypto";
import { companyProblem, normalizeWebsite, websiteDomain, workEmailMatches } from "@/domain/org/company";
import { jobProblem, normalizeApplyUrl } from "@/domain/org/jobs";
import type { Session } from "./auth";
import { table } from "./db/table";
import { touchTenant } from "./supabase";
import { parseEmailList, sendMail } from "./notify";
import { escapeHtml, renderEmailLayout } from "./email/layout";
import { siteUrl } from "@/lib/siteUrl";
import { notifyTenant } from "./push/subscriptions";
import { can, isOrgRole, type OrgPermission } from "@/domain/org/permissions";
import { searchTalent, type TalentMatch } from "@/domain/org/talent";
import type { Conversation, ConversationStatus, EmployerJob, EmployerJobStatus, Membership, Message, OrgInvite, OrgRole, Organization, ShortlistEntry, ShortlistStatus, TalentProfile } from "@/domain/org/types";

export class HiringError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "HiringError";
  }
}

// ---- rows ----------------------------------------------------------------------------------------------------
type OrgRow = { id: string; name: string; website: string | null; verified: boolean; created_by: string; created_at: string };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; email: string | null; name: string | null; joined_at: string };
type InviteRow = { id: string; org_id: string; email: string; role: OrgRole; invited_by: string; created_at: string };
type JobRow = { id: string; org_id: string; title: string; location: string; work_mode: EmployerJob["workMode"]; job_type: string | null; salary_min: number | null; salary_max: number | null; currency: string; description: string; skills: string[]; apply_url: string; status: EmployerJobStatus; created_by: string; created_at: string; updated_at: string };
type TalentRow = { tenant_id: string; display_name: string; headline: string; seniority: string; years_experience: number; skills: string[]; locations: string[]; work_modes: string[]; summary: string; updated_at: string };
type ShortlistRow = { id: string; org_id: string; candidate_tenant: string; job_id: string | null; note: string; status: ShortlistStatus; added_by: string; created_at: string; updated_at: string };
type ConversationRow = { id: string; org_id: string; candidate_tenant: string; job_id: string | null; status: ConversationStatus; started_by: string; created_at: string; updated_at: string };
type MessageRow = { id: string; conversation_id: string; sender_tenant: string; side: "org" | "candidate"; body: string; created_at: string };

const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");
const invites = () => table<InviteRow>("hiring_invites");
const jobs = () => table<JobRow>("employer_jobs");
const talent = () => table<TalentRow>("talent_profiles");
const shortlist = () => table<ShortlistRow>("hiring_shortlist");
const conversations = () => table<ConversationRow>("hiring_conversations");
const messages = () => table<MessageRow>("hiring_messages");

const now = () => new Date().toISOString();
const id = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const email = (s: string) => s.trim().toLowerCase();

const toOrg = (r: OrgRow): Organization => ({ id: r.id, name: r.name, website: r.website ?? undefined, verified: !!r.verified, createdAt: r.created_at });
const toMember = (r: MemberRow): Membership => ({ orgId: r.org_id, tenantId: r.tenant_id, role: r.role, email: r.email ?? undefined, name: r.name ?? undefined, joinedAt: r.joined_at });
const toInvite = (r: InviteRow): OrgInvite => ({ id: r.id, orgId: r.org_id, email: r.email, role: r.role, invitedBy: r.invited_by, createdAt: r.created_at });
const toJob = (r: JobRow): EmployerJob => ({ id: r.id, orgId: r.org_id, title: r.title, location: r.location, workMode: r.work_mode, jobType: (r.job_type ?? undefined) as EmployerJob["jobType"], salaryMin: r.salary_min ?? undefined, salaryMax: r.salary_max ?? undefined, currency: r.currency, description: r.description, skills: r.skills ?? [], applyUrl: r.apply_url, status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at });
const toTalent = (r: TalentRow): TalentProfile => ({ tenantId: r.tenant_id, displayName: r.display_name, headline: r.headline, seniority: r.seniority, yearsExperience: r.years_experience, skills: r.skills ?? [], locations: r.locations ?? [], workModes: r.work_modes ?? [], summary: r.summary, updatedAt: r.updated_at });
const toShortlist = (r: ShortlistRow): ShortlistEntry => ({ id: r.id, orgId: r.org_id, candidateTenant: r.candidate_tenant, jobId: r.job_id ?? undefined, note: r.note, status: r.status, addedBy: r.added_by, createdAt: r.created_at, updatedAt: r.updated_at });
const toConversation = (r: ConversationRow): Conversation => ({ id: r.id, orgId: r.org_id, candidateTenant: r.candidate_tenant, jobId: r.job_id ?? undefined, status: r.status, startedBy: r.started_by, createdAt: r.created_at, updatedAt: r.updated_at });
const toMessage = (r: MessageRow): Message => ({ id: r.id, conversationId: r.conversation_id, senderTenant: r.sender_tenant, side: r.side, body: r.body, createdAt: r.created_at });

// ---- membership and permission -------------------------------------------------------------------------------
export async function membershipOf(s: Session, orgId: string): Promise<Membership | undefined> {
  const r = await members().one({ org_id: orgId, tenant_id: s.tenantId });
  return r && isOrgRole(r.role) ? toMember(r) : undefined;
}

/** The caller's membership when their role allows `permission` in this organization; otherwise a 403. */
export async function requirePermission(s: Session, orgId: string, permission: OrgPermission): Promise<Membership> {
  const m = await membershipOf(s, orgId);
  if (!m || !can(m.role, permission)) throw new HiringError("Your role in this workspace can't do that.", 403);
  return m;
}

export interface Workspace {
  org: Organization;
  role: OrgRole;
}

/** The workspaces the caller belongs to, and invitations waiting for their email. */
export async function myWorkspaces(s: Session): Promise<{ me: string; workspaces: Workspace[]; invites: (OrgInvite & { orgName: string })[] }> {
  const mine = await members().find({ tenant_id: s.tenantId });
  const orgRows = await orgs().findIn("id", mine.map((m) => m.org_id));
  const workspaces = mine.filter((m) => isOrgRole(m.role)).flatMap((m) => {
    const o = orgRows.find((x) => x.id === m.org_id);
    return o ? [{ org: toOrg(o), role: m.role }] : [];
  });
  const pending = s.email ? await invites().find({ email: email(s.email) }) : [];
  const open = pending.filter((i) => !mine.some((m) => m.org_id === i.org_id));
  const inviteOrgs = await orgs().findIn("id", open.map((i) => i.org_id));
  return { me: s.tenantId, workspaces, invites: open.map((i) => ({ ...toInvite(i), orgName: inviteOrgs.find((o) => o.id === i.org_id)?.name ?? "A company" })) };
}

export async function createWorkspace(s: Session, input: { name: string; website?: string }): Promise<Workspace> {
  const problem = companyProblem(input);
  if (problem) throw new HiringError(problem);
  const name = input.name.trim();
  const website = normalizeWebsite(input.website) || null;
  await touchTenant(s.tenantId);
  const org: OrgRow = { id: id("org"), name, website, verified: false, created_by: s.tenantId, created_at: now() };
  await orgs().insert(org);
  await members().insert({ org_id: org.id, tenant_id: s.tenantId, role: "owner", email: s.email ? email(s.email) : null, name: s.name ?? null, joined_at: now() });
  return { org: toOrg(org), role: "owner" };
}

/**
 * An Owner changes the company's name or website. Open jobs show the new name at once (job seekers read it
 * from the workspace). A verified company that changes either goes back to unverified, so a check made for
 * one identity never vouches for another.
 */
export async function updateWorkspace(s: Session, orgId: string, input: { name: string; website?: string }): Promise<Organization> {
  await requirePermission(s, orgId, "org.manage");
  const problem = companyProblem(input);
  if (problem) throw new HiringError(problem);
  const current = await orgs().one({ id: orgId });
  if (!current) throw new HiringError("That workspace no longer exists.", 404);
  const name = input.name.trim();
  const website = normalizeWebsite(input.website) || null;
  const changed = name !== current.name || website !== current.website;
  const patch: Partial<OrgRow> = { name, website, ...(changed && current.verified ? { verified: false } : {}) };
  await orgs().update({ id: orgId }, patch);
  return toOrg({ ...current, ...patch });
}

/**
 * An Owner deletes the workspace, after typing its name. Its members, invitations, jobs (and with them their
 * career-site links and applications), shortlist and conversations go too (foreign keys cascade). Job seekers'
 * own accounts are untouched. Can't be undone.
 */
export async function deleteWorkspace(s: Session, orgId: string, confirmName: string): Promise<void> {
  await requirePermission(s, orgId, "org.manage");
  const current = await orgs().one({ id: orgId });
  if (!current) throw new HiringError("That workspace no longer exists.", 404);
  if (confirmName.trim() !== current.name) throw new HiringError(`Type the company's name, ${current.name}, to delete it.`);
  // The database cascades from hiring_orgs; removing the children by name keeps the local, in-memory store the same.
  for (const t of [conversations(), shortlist(), jobs(), invites(), members()]) await t.remove({ org_id: orgId });
  await orgs().remove({ id: orgId });
}

// ---- verification -------------------------------------------------------------------------------------------
export interface VerificationOptions {
  verified: boolean;
  websiteDomain: string | null;
  /** The Owner's own sign-in email: verifying by it is instant when it's on the website's domain. */
  email: string | null;
  workEmailMatches: boolean;
}

export async function verificationOptions(s: Session, orgId: string): Promise<VerificationOptions> {
  await requirePermission(s, orgId, "org.manage");
  const org = await orgs().one({ id: orgId });
  if (!org) throw new HiringError("That workspace no longer exists.", 404);
  return { verified: !!org.verified, websiteDomain: websiteDomain(org.website), email: s.email ?? null, workEmailMatches: workEmailMatches(s.email, org.website) };
}

/**
 * An Owner whose signed-in email is on the company website's domain verifies the company at once. The email
 * comes from the authenticated session (Supabase Auth checked it), never from the request.
 */
export async function verifyByWorkEmail(s: Session, orgId: string): Promise<Organization> {
  await requirePermission(s, orgId, "org.manage");
  const org = await orgs().one({ id: orgId });
  if (!org) throw new HiringError("That workspace no longer exists.", 404);
  if (!websiteDomain(org.website)) throw new HiringError("Add your company's website first (Edit this workspace…).");
  if (!workEmailMatches(s.email, org.website)) throw new HiringError(`Your sign-in email isn't on ${websiteDomain(org.website)}. Sign in with your work email, or ask WonderJobs to review the company.`, 409);
  await orgs().update({ id: orgId }, { verified: true });
  return toOrg({ ...org, verified: true });
}

/** An Owner asks WonderJobs to review the company; the team gets an email. Returns whether it was sent. */
export async function requestVerificationReview(s: Session, orgId: string, note: string): Promise<{ sent: boolean }> {
  await requirePermission(s, orgId, "org.manage");
  const org = await orgs().one({ id: orgId });
  if (!org) throw new HiringError("That workspace no longer exists.", 404);
  if (org.verified) throw new HiringError("This company is already verified.", 409);
  if (!websiteDomain(org.website)) throw new HiringError("Add your company's website first (Edit this workspace…), so the team can check it.");
  const team = parseEmailList(process.env.CONTACT_NOTIFY_EMAILS);
  if (!team.length) return { sent: false };
  const text = note.trim().slice(0, 2000);
  const mail = renderEmailLayout({
    origin: siteUrl().origin,
    preheader: `${org.name} asks to be verified`,
    bodyHtml: `<div style="font-size:18px;font-weight:700;margin:0 0 10px">Company verification request</div><p style="margin:0 0 6px"><b>${escapeHtml(org.name)}</b> · ${escapeHtml(org.website ?? "")}</p><p style="margin:0 0 6px">Requested by ${escapeHtml(s.email ?? "an Owner without an email")}</p>${text ? `<p style="margin:0 0 6px;white-space:pre-wrap">${escapeHtml(text)}</p>` : ""}<p style="margin:12px 0 0"><a href="${escapeHtml(new URL("/platform/companies", siteUrl().origin).toString())}">Review it in Platform → Companies</a></p>`,
    bodyText: [`Company verification request`, `${org.name} · ${org.website ?? ""}`, `Requested by ${s.email ?? "an Owner without an email"}`, text, `Review it: ${new URL("/platform/companies", siteUrl().origin)}`].filter(Boolean).join("\n\n"),
    reason: "You're getting this because this address receives WonderJobs operator messages.",
    settingsLink: false,
  });
  let sent = false;
  for (const to of team) if ((await sendMail({ to, subject: `[WonderJobs] Verify ${org.name}`, replyTo: s.email ?? undefined, ...mail })).sent) sent = true;
  return { sent };
}

/** Platform admins: every company, unverified first, with its Owners' emails. Cross-tenant by design (admin only). */
export async function listCompaniesForAdmin(): Promise<(Organization & { owners: string[]; openJobs: number })[]> {
  const rows = await orgs().all({ order: "created_at", desc: true, limit: 500 });
  const ids = rows.map((r) => r.id);
  const [owners, open] = await Promise.all([members().findIn("org_id", ids, { role: "owner" }), jobs().findIn("org_id", ids, { status: "open" })]);
  return rows
    .map((r) => ({ ...toOrg(r), owners: owners.filter((m) => m.org_id === r.id && m.email).map((m) => m.email!), openJobs: open.filter((j) => j.org_id === r.id).length }))
    .sort((a, b) => Number(a.verified) - Number(b.verified));
}

/** Platform admins verify or unverify a company; on verify its Owners are told. Returns whether any email went. */
export async function setCompanyVerified(orgId: string, verified: boolean): Promise<{ emailed: boolean }> {
  const org = await orgs().one({ id: orgId });
  if (!org) throw new HiringError("That company no longer exists.", 404);
  await orgs().update({ id: orgId }, { verified });
  if (!verified) return { emailed: false };
  const owners = (await members().find({ org_id: orgId, role: "owner" })).flatMap((m) => (m.email ? [m.email] : []));
  const mail = renderEmailLayout({
    origin: siteUrl().origin,
    preheader: `${org.name} is verified on WonderJobs`,
    bodyHtml: `<div style="font-size:18px;font-weight:700;margin:0 0 10px">${escapeHtml(org.name)} is verified</div><p style="margin:0">Your open jobs no longer carry the unverified-employer note, so job seekers can apply with confidence.</p>`,
    bodyText: `${org.name} is verified\n\nYour open jobs no longer carry the unverified-employer note, so job seekers can apply with confidence.`,
    reason: "You're getting this because you're an Owner of this hiring workspace on WonderJobs.",
    settingsLink: false,
  });
  let emailed = false;
  for (const to of owners) if ((await sendMail({ to, subject: `${org.name} is verified on WonderJobs`, ...mail })).sent) emailed = true;
  return { emailed };
}

export async function listTeam(s: Session, orgId: string): Promise<{ members: Membership[]; invites: OrgInvite[] }> {
  const me = await membershipOf(s, orgId);
  if (!me) throw new HiringError("You're not in this workspace.", 403);
  const team = (await members().find({ org_id: orgId }, { order: "joined_at" })).map(toMember);
  // Only someone who manages the team sees who's been invited.
  const pending = can(me.role, "org.manage") ? (await invites().find({ org_id: orgId }, { order: "created_at" })).map(toInvite) : [];
  return { members: team, invites: pending };
}

export async function inviteMember(s: Session, orgId: string, to: string, role: OrgRole): Promise<OrgInvite> {
  await requirePermission(s, orgId, "org.manage");
  const e = email(to);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HiringError("That doesn't look like an email address.");
  if (!isOrgRole(role)) throw new HiringError("Pick a role.");
  const team = await members().find({ org_id: orgId });
  if (team.some((m) => m.email === e)) throw new HiringError("They're already in this workspace.", 409);
  await invites().remove({ org_id: orgId, email: e });
  const row: InviteRow = { id: id("inv"), org_id: orgId, email: e, role, invited_by: s.tenantId, created_at: now() };
  await invites().insert(row);
  return toInvite(row);
}

export async function cancelInvite(s: Session, orgId: string, inviteId: string): Promise<void> {
  await requirePermission(s, orgId, "org.manage");
  await invites().remove({ id: inviteId, org_id: orgId });
}

/** An invitation is accepted only by someone signed in with the invited email. */
export async function acceptInvite(s: Session, inviteId: string): Promise<Workspace> {
  if (!s.email) throw new HiringError("Sign in with the invited email to join.", 403);
  const inv = await invites().one({ id: inviteId, email: email(s.email) });
  if (!inv) throw new HiringError("That invitation isn't for this account, or it was withdrawn.", 404);
  const org = await orgs().one({ id: inv.org_id });
  if (!org) throw new HiringError("That workspace no longer exists.", 404);
  await touchTenant(s.tenantId);
  if (!(await members().one({ org_id: inv.org_id, tenant_id: s.tenantId }))) {
    await members().insert({ org_id: inv.org_id, tenant_id: s.tenantId, role: inv.role, email: email(s.email), name: s.name ?? null, joined_at: now() });
  }
  await invites().remove({ id: inv.id, org_id: inv.org_id });
  return { org: toOrg(org), role: inv.role };
}

export async function declineInvite(s: Session, inviteId: string): Promise<void> {
  if (!s.email) return;
  await invites().remove({ id: inviteId, email: email(s.email) });
}

async function owners(orgId: string) {
  return (await members().find({ org_id: orgId, role: "owner" })).length;
}

export async function setMemberRole(s: Session, orgId: string, tenantId: string, role: OrgRole): Promise<void> {
  await requirePermission(s, orgId, "org.manage");
  if (!isOrgRole(role)) throw new HiringError("Pick a role.");
  const target = await members().one({ org_id: orgId, tenant_id: tenantId });
  if (!target) throw new HiringError("They're not in this workspace.", 404);
  if (target.role === "owner" && role !== "owner" && (await owners(orgId)) <= 1) throw new HiringError("A workspace needs at least one owner.", 409);
  await members().update({ org_id: orgId, tenant_id: tenantId }, { role });
}

/** An owner removes someone, or anyone leaves; the last owner can't. */
export async function removeMember(s: Session, orgId: string, tenantId: string): Promise<void> {
  if (tenantId !== s.tenantId) await requirePermission(s, orgId, "org.manage");
  const target = await members().one({ org_id: orgId, tenant_id: tenantId });
  if (!target) throw new HiringError("They're not in this workspace.", 404);
  if (target.role === "owner" && (await owners(orgId)) <= 1) throw new HiringError("A workspace needs at least one owner.", 409);
  await members().remove({ org_id: orgId, tenant_id: tenantId });
}

// ---- jobs ----------------------------------------------------------------------------------------------------
export interface JobInput {
  title: string;
  location: string;
  workMode: EmployerJob["workMode"];
  jobType?: EmployerJob["jobType"];
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  description: string;
  skills?: string[];
  applyUrl: string;
}

function checkJob(i: JobInput) {
  const problem = jobProblem(i);
  if (problem) throw new HiringError(problem);
}

export async function listOrgJobs(s: Session, orgId: string): Promise<EmployerJob[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await jobs().find({ org_id: orgId }, { order: "updated_at", desc: true })).map(toJob);
}

export async function saveJob(s: Session, orgId: string, input: JobInput, jobId?: string): Promise<EmployerJob> {
  await requirePermission(s, orgId, "jobs.edit");
  checkJob(input);
  const fields = {
    title: input.title.trim().slice(0, 140),
    location: input.location.trim().slice(0, 120),
    work_mode: input.workMode,
    job_type: input.jobType ?? null,
    salary_min: input.salaryMin ?? null,
    salary_max: input.salaryMax ?? null,
    currency: (input.currency ?? "INR").slice(0, 3).toUpperCase(),
    description: input.description.trim().slice(0, 8000),
    skills: (input.skills ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 25),
    apply_url: normalizeApplyUrl(input.applyUrl),
    updated_at: now(),
  };
  if (jobId) {
    const n = await jobs().update({ id: jobId, org_id: orgId }, fields);
    if (!n) throw new HiringError("That job isn't in this workspace.", 404);
    return toJob((await jobs().one({ id: jobId, org_id: orgId }))!);
  }
  const row: JobRow = { id: id("ejob"), org_id: orgId, status: "draft", created_by: s.tenantId, created_at: now(), ...fields };
  await jobs().insert(row);
  return toJob(row);
}

export async function setJobStatus(s: Session, orgId: string, jobId: string, status: EmployerJobStatus): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  if (!["draft", "open", "closed"].includes(status)) throw new HiringError("Unknown status.");
  const n = await jobs().update({ id: jobId, org_id: orgId }, { status, updated_at: now() });
  if (!n) throw new HiringError("That job isn't in this workspace.", 404);
}

/** Open listings for job seekers' searches — public postings, with the company that posted them. */
export async function openJobs(limit = 300): Promise<{ job: EmployerJob; org: Organization }[]> {
  const rows = await jobs().find({ status: "open" }, { order: "updated_at", desc: true, limit });
  const orgRows = await orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))]);
  return rows.flatMap((r) => {
    const o = orgRows.find((x) => x.id === r.org_id);
    return o ? [{ job: toJob(r), org: toOrg(o) }] : [];
  });
}

// ---- talent --------------------------------------------------------------------------------------------------
export async function myTalentProfile(s: Session): Promise<TalentProfile | null> {
  const r = await talent().one({ tenant_id: s.tenantId });
  return r ? toTalent(r) : null;
}

export async function saveMyTalentProfile(s: Session, p: Omit<TalentProfile, "tenantId" | "updatedAt">): Promise<TalentProfile> {
  await touchTenant(s.tenantId);
  const row: TalentRow = {
    tenant_id: s.tenantId,
    display_name: p.displayName.slice(0, 60) || "Candidate",
    headline: p.headline.slice(0, 160),
    seniority: p.seniority.slice(0, 20),
    years_experience: Math.max(0, Math.min(60, Math.round(p.yearsExperience || 0))),
    skills: p.skills.slice(0, 30).map((x) => x.slice(0, 60)),
    locations: p.locations.slice(0, 10).map((x) => x.slice(0, 80)),
    work_modes: p.workModes.filter((m) => ["remote", "hybrid", "onsite"].includes(m)),
    summary: p.summary.slice(0, 600),
    updated_at: now(),
  };
  // One write, so recruiters never see the profile missing between a delete and an insert.
  await talent().upsert(row, ["tenant_id"]);
  return toTalent(row);
}

/** Turning "Open to recruiters" off removes the profile; workspaces can no longer find or newly message them. */
export async function removeMyTalentProfile(s: Session): Promise<void> {
  await talent().remove({ tenant_id: s.tenantId });
}

export async function findTalent(s: Session, orgId: string, query: string, place: string): Promise<TalentMatch[]> {
  await requirePermission(s, orgId, "talent.search");
  const all = (await talent().all({ order: "updated_at", desc: true, limit: 1000 })).map(toTalent);
  return searchTalent(all, query, place).slice(0, 50);
}

async function visibleTalent(tenantIds: string[]) {
  return (await talent().findIn("tenant_id", tenantIds)).map(toTalent);
}

// ---- shortlist and reports -----------------------------------------------------------------------------------
export interface ShortlistView extends ShortlistEntry {
  /** What the candidate shows recruiters; null once they stopped being open to recruiters. */
  candidate: TalentProfile | null;
  jobTitle?: string;
}

export async function listShortlist(s: Session, orgId: string): Promise<ShortlistView[]> {
  await requirePermission(s, orgId, "shortlist.view");
  const rows = (await shortlist().find({ org_id: orgId }, { order: "updated_at", desc: true })).map(toShortlist);
  const people = await visibleTalent([...new Set(rows.map((r) => r.candidateTenant))]);
  const orgJobs = await jobs().find({ org_id: orgId });
  return rows.map((r) => ({ ...r, candidate: people.find((p) => p.tenantId === r.candidateTenant) ?? null, jobTitle: orgJobs.find((j) => j.id === r.jobId)?.title }));
}

export async function addToShortlist(s: Session, orgId: string, candidateTenant: string, note: string, jobId?: string): Promise<ShortlistEntry> {
  await requirePermission(s, orgId, "shortlist.edit");
  if (!(await talent().one({ tenant_id: candidateTenant }))) throw new HiringError("That candidate isn't open to recruiters.", 404);
  if (jobId && !(await jobs().one({ id: jobId, org_id: orgId }))) throw new HiringError("That job isn't in this workspace.", 404);
  const existing = (await shortlist().find({ org_id: orgId, candidate_tenant: candidateTenant })).find((r) => (r.job_id ?? undefined) === jobId);
  if (existing) throw new HiringError("They're already on the shortlist for that.", 409);
  const row: ShortlistRow = { id: id("sl"), org_id: orgId, candidate_tenant: candidateTenant, job_id: jobId ?? null, note: note.trim().slice(0, 2000), status: "shortlisted", added_by: s.tenantId, created_at: now(), updated_at: now() };
  await shortlist().insert(row);
  return toShortlist(row);
}

/** Recruiters write the note and report to hiring managers; only a role that decides moves it to Interview or Passed. */
export async function updateShortlist(s: Session, orgId: string, entryId: string, patch: { note?: string; status?: ShortlistStatus }): Promise<void> {
  const deciding = patch.status === "interview" || patch.status === "passed";
  await requirePermission(s, orgId, deciding ? "shortlist.decide" : "shortlist.edit");
  if (patch.status && !["shortlisted", "reported", "interview", "passed"].includes(patch.status)) throw new HiringError("Unknown status.");
  const fields: Partial<ShortlistRow> = { updated_at: now() };
  if (patch.note != null) fields.note = patch.note.trim().slice(0, 2000);
  if (patch.status) fields.status = patch.status;
  const n = await shortlist().update({ id: entryId, org_id: orgId }, fields);
  if (!n) throw new HiringError("That entry isn't in this workspace.", 404);
}

export async function removeFromShortlist(s: Session, orgId: string, entryId: string): Promise<void> {
  await requirePermission(s, orgId, "shortlist.edit");
  await shortlist().remove({ id: entryId, org_id: orgId });
}

// ---- messages ------------------------------------------------------------------------------------------------
export interface ConversationView extends Conversation {
  orgName: string;
  candidateName: string;
  jobTitle?: string;
  last?: Message;
}

const MAX_BODY = 4000;
function body(text: string) {
  const b = text.trim();
  if (!b) throw new HiringError("Write a message first.");
  return b.slice(0, MAX_BODY);
}

async function views(rows: ConversationRow[]): Promise<ConversationView[]> {
  if (!rows.length) return [];
  const orgRows = await orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))]);
  const people = await visibleTalent([...new Set(rows.map((r) => r.candidate_tenant))]);
  const jobRows = await jobs().findIn("id", rows.flatMap((r) => (r.job_id ? [r.job_id] : [])));
  const lasts = await Promise.all(rows.map(async (r) => (await messages().find({ conversation_id: r.id }, { order: "created_at", desc: true, limit: 1 }))[0]));
  return rows.map((r, i) => ({
    ...toConversation(r),
    orgName: orgRows.find((o) => o.id === r.org_id)?.name ?? "A company",
    candidateName: people.find((p) => p.tenantId === r.candidate_tenant)?.displayName ?? "Candidate",
    jobTitle: jobRows.find((j) => j.id === r.job_id)?.title,
    last: lasts[i] ? toMessage(lasts[i]) : undefined,
  }));
}

export async function orgConversations(s: Session, orgId: string): Promise<ConversationView[]> {
  await requirePermission(s, orgId, "messages.view");
  return views(await conversations().find({ org_id: orgId }, { order: "updated_at", desc: true, limit: 200 }));
}

export async function myConversations(s: Session): Promise<ConversationView[]> {
  return views(await conversations().find({ candidate_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 200 }));
}

/** Who the caller is in a conversation: its candidate, or a member of its company whose role lets them read it. */
async function access(s: Session, conversationId: string, prefer: "org" | "candidate" = "candidate") {
  const c = await conversations().one({ id: conversationId });
  if (!c) throw new HiringError("Conversation not found.", 404);
  // Someone who is both (a recruiter writing to their own profile) reads it from the side they opened it on.
  const m = await membershipOf(s, c.org_id);
  const asOrg = !!m && can(m.role, "messages.view");
  if (c.candidate_tenant === s.tenantId && !(prefer === "org" && asOrg)) return { c, side: "candidate" as const, member: undefined };
  if (!asOrg) throw new HiringError("Conversation not found.", 404);
  return { c, side: "org" as const, member: m };
}

export async function conversationMessages(s: Session, conversationId: string, prefer?: "org" | "candidate"): Promise<{ conversation: ConversationView; messages: Message[]; side: "org" | "candidate"; canSend: boolean; candidateOpen: boolean }> {
  const { c, side, member } = await access(s, conversationId, prefer);
  const list = (await messages().find({ conversation_id: c.id }, { order: "created_at" })).map(toMessage);
  const [view] = await views([c]);
  const candidateOpen = !!(await talent().one({ tenant_id: c.candidate_tenant }));
  const canSend = side === "candidate" ? c.status !== "blocked" : !!member && can(member.role, "messages.send") && c.status === "open" && candidateOpen;
  return { conversation: view, messages: list, side, canSend, candidateOpen };
}

/** A recruiter's first message: only to someone open to recruiters, never after they declined or blocked this company. */
export async function startConversation(s: Session, orgId: string, candidateTenant: string, text: string, jobId?: string): Promise<string> {
  await requirePermission(s, orgId, "messages.send");
  const b = body(text);
  if (!(await talent().one({ tenant_id: candidateTenant }))) throw new HiringError("That candidate isn't open to recruiters.", 404);
  if (jobId && !(await jobs().one({ id: jobId, org_id: orgId }))) throw new HiringError("That job isn't in this workspace.", 404);
  let c = await conversations().one({ org_id: orgId, candidate_tenant: candidateTenant });
  if (c && c.status !== "open") throw new HiringError(c.status === "blocked" ? "This candidate blocked messages from your company." : "This candidate declined this conversation.", 409);
  if (!c) {
    c = { id: id("conv"), org_id: orgId, candidate_tenant: candidateTenant, job_id: jobId ?? null, status: "open", started_by: s.tenantId, created_at: now(), updated_at: now() };
    await conversations().insert(c);
  }
  await post(c, s.tenantId, "org", b);
  return c.id;
}

export async function sendMessage(s: Session, conversationId: string, text: string, prefer?: "org" | "candidate"): Promise<Message> {
  const { c, side, member } = await access(s, conversationId, prefer);
  const b = body(text);
  if (side === "org") {
    if (!member || !can(member.role, "messages.send")) throw new HiringError("Your role in this workspace can't send messages.", 403);
    if (c.status !== "open") throw new HiringError(c.status === "blocked" ? "This candidate blocked messages from your company." : "This candidate declined this conversation.", 409);
    // A company writes only while the candidate is still open to recruiters, in a new thread or an old one.
    if (!(await talent().one({ tenant_id: c.candidate_tenant }))) throw new HiringError("This candidate is no longer open to recruiters.", 409);
  } else if (c.status === "blocked") {
    throw new HiringError("Unblock this company to write to them.", 409);
  }
  // A candidate writing back reopens a conversation they had declined.
  if (side === "candidate" && c.status === "declined") await conversations().update({ id: c.id, candidate_tenant: s.tenantId }, { status: "open" });
  return post(c, s.tenantId, side, b);
}

async function post(c: ConversationRow, sender: string, side: "org" | "candidate", text: string): Promise<Message> {
  const row: MessageRow = { id: id("msg"), conversation_id: c.id, sender_tenant: sender, side, body: text, created_at: now() };
  await messages().insert(row);
  await conversations().update({ id: c.id }, { updated_at: row.created_at });
  // Tell the other side; a push failure never blocks the message.
  const org = await orgs().one({ id: c.org_id });
  const to = side === "org" ? c.candidate_tenant : c.started_by;
  const url = side === "org" ? `/app/recruiters?c=${c.id}` : `/app/hiring?tab=messages&c=${c.id}`;
  await notifyTenant(to, { title: side === "org" ? `Message from ${org?.name ?? "a company"}` : "A candidate replied", body: text.slice(0, 140), url, tag: `conv:${c.id}` }).catch(() => undefined);
  return toMessage(row);
}

/** The candidate's choice: decline (the company can't write until they do), block, or open again. */
export async function setConversationStatus(s: Session, conversationId: string, status: ConversationStatus): Promise<void> {
  if (!["open", "declined", "blocked"].includes(status)) throw new HiringError("Unknown status.");
  const n = await conversations().update({ id: conversationId, candidate_tenant: s.tenantId }, { status, updated_at: now() });
  if (!n) throw new HiringError("Conversation not found.", 404);
}
