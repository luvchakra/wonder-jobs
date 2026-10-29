/**
 * WonderStar Internships (WJ-417): companies' internship postings and students' applications to them, in the
 * platform's module-keyed `listings` / `responses` tables (module = 'internships'), apart from Jobs' employer_jobs and
 * job_applications.
 *
 * Company side: every function takes the caller's session and checks their role in that hiring workspace on the
 * server (`requirePermission` → `domain/org/permissions.ts::can`), then filters by org_id and module.
 * Student side: every query filters by the session's tenant (responder_tenant) and module.
 * The one cross-tenant read is open postings, which are public.
 *
 * Applying is the student's own press, gated by `resolveCapability("internships.apply")` read here on the server from
 * their saved policy (a failed or missing lookup fails closed to asking), once per posting and email, and audited.
 */
import { randomUUID } from "node:crypto";
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError, requirePermission } from "../hiring";
import { sendMail } from "../notify";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "../email/layout";
import { deliver, type Notice } from "../notifications/deliver";
import { decryptFile, encryptFile, resumeFileStore } from "../resume/files";
import { readClientState } from "../clientState";
import { siteUrl } from "@/lib/siteUrl";
import { can } from "@/domain/org/permissions";
import type { OrgRole } from "@/domain/org/types";
import { defaultPolicy, resolveCapability, type AutomationLevel, type AutomationPolicy } from "@/domain/automation/policy";
import {
  canWithdraw,
  cleanPosting,
  cleanProfile,
  COMPANY_NEXT,
  INTERNSHIPS,
  readTerms,
  STATUS_LABEL,
  stillOpen,
  type InternshipPosting,
  type InternshipApplicationView,
  type InternshipStatus,
  type MyInternshipApplication,
  type PostingInput,
  type StudentProfile,
} from "@/modules/internships/domain";

// ---- rows ----------------------------------------------------------------------------------------------------
export type ListingRow = { id: string; module: string; org_id: string; title: string; description: string; location: string; work_mode: InternshipPosting["workMode"]; skills: string[]; attrs: Record<string, unknown>; status: InternshipPosting["status"]; created_by: string; created_at: string; updated_at: string };
type ResponseRow = { id: string; module: string; listing_id: string; org_id: string; responder_tenant: string; email: string; name: string; status: InternshipStatus; profile: StudentProfile & { skills?: string[] }; cover_note: string; consent_at: string; created_at: string; updated_at: string };
type EventRow = { response_id: string; org_id: string; event: string; actor: string | null; detail: string | null; at: string };
type FileRow = { response_id: string; org_id: string; filename: string; mime: string; ciphertext: string; created_at: string };
type OrgRow = { id: string; name: string; website: string | null; verified?: boolean };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; email: string | null };

const listings = () => table<ListingRow>("listings");
const responses = () => table<ResponseRow>("responses");
const events = () => table<EventRow>("response_events");
const files = () => table<FileRow>("response_files");
const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");

const now = () => new Date().toISOString();
const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
/** Résumé copies are encrypted per workspace, apart from Jobs' Easy Apply files. */
const fileOwner = (orgId: string) => `org:${orgId}:internships`;

export const toPosting = (r: ListingRow): InternshipPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, skills: r.skills ?? [], terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

async function record(r: Pick<ResponseRow, "id" | "org_id">, event: string, actor: string | null, detail?: string) {
  await events().insert({ response_id: r.id, org_id: r.org_id, event, actor, detail: detail ?? null, at: now() });
}

// ---- company side: postings ------------------------------------------------------------------------------------

export async function orgInternships(s: Session, orgId: string): Promise<InternshipPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: INTERNSHIPS }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** Post (as a draft) or edit an internship. Only the Internships form's fields; Jobs' job form is untouched. */
export async function saveInternship(s: Session, orgId: string, input: PostingInput, postingId?: string): Promise<InternshipPosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const clean = cleanPosting(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const v = clean.value;
  const at = now();
  const fields = { title: v.title, description: v.description, location: v.location, work_mode: v.workMode, skills: v.skills, attrs: { ...v.terms }, updated_at: at };
  if (postingId) {
    const n = await listings().update({ id: postingId, org_id: orgId, module: INTERNSHIPS }, fields);
    if (!n) throw new HiringError("That internship isn't in this workspace.", 404);
    return toPosting((await listings().one({ id: postingId, org_id: orgId, module: INTERNSHIPS }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: INTERNSHIPS, org_id: orgId, ...fields, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return toPosting(row);
}

/** Open, close or reopen. An internship whose last day to apply has passed can't be opened. */
export async function setInternshipStatus(s: Session, orgId: string, postingId: string, status: InternshipPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const r = await listings().one({ id: postingId, org_id: orgId, module: INTERNSHIPS });
  if (!r) throw new HiringError("That internship isn't in this workspace.", 404);
  if (status === "open" && !stillOpen(readTerms(r.attrs))) throw new HiringError("Its last day to apply has passed. Change the dates first.", 409);
  await listings().update({ id: postingId, org_id: orgId, module: INTERNSHIPS }, { status, updated_at: now() });
}

/** Every open internship whose last day to apply hasn't passed, with its company (public postings: the one cross-tenant read). */
export async function openInternships(limit = 300): Promise<{ posting: InternshipPosting; org: { id: string; name: string; verified: boolean } }[]> {
  const rows = (await listings().find({ module: INTERNSHIPS, status: "open" }, { order: "updated_at", desc: true, limit })).map(toPosting).filter((p) => stillOpen(p.terms));
  const byOrg = new Map((await orgs().findIn("id", [...new Set(rows.map((p) => p.orgId))])).map((o) => [o.id, o]));
  return rows.flatMap((posting) => {
    const o = byOrg.get(posting.orgId);
    return o ? [{ posting, org: { id: o.id, name: o.name, verified: !!o.verified } }] : [];
  });
}

// ---- the gate ------------------------------------------------------------------------------------------------

/** `resolveCapability("internships.apply")` for this student, from their saved policy. No saved policy, or a failed read: ask. */
export async function applyDecision(tenantId: string): Promise<"run" | "ask" | "skip"> {
  try {
    const st = await readClientState<{ policy?: Partial<AutomationPolicy>; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation");
    if (!st?.policy) return "ask";
    return resolveCapability("internships.apply", { ...defaultPolicy(), ...st.policy }, st.defaultLevel ?? "guided");
  } catch {
    return "ask";
  }
}

// ---- student side --------------------------------------------------------------------------------------------

export interface ApplyInput {
  postingId: string;
  name: string;
  profile: unknown;
  skills?: string[];
  coverNote?: string;
  resumeFileId: string;
  consent: true;
  /** The student saw everything and pressed Send (required when their setting is Ask me). */
  confirmed?: boolean;
}

/**
 * The student's application to an internship posted on WonderStar: their account email, the profile they confirmed
 * (college, course, graduation year, availability), their skills, and a copy of the résumé they chose, into that
 * company's applications. Once per posting and email (the database refuses a second).
 */
export async function applyToInternship(s: Session, input: ApplyInput): Promise<{ id: string; title: string; company: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to apply.", 403);
  const decision = await applyDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Internship applications are turned off in Internships → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your details, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const profile = cleanProfile(input.profile);
  if ("problem" in profile) throw new HiringError(profile.problem);
  const posting = await listings().one({ id: input.postingId, module: INTERNSHIPS, status: "open" });
  if (!posting || !stillOpen(readTerms(posting.attrs))) throw new HiringError("This internship is no longer open.", 404);
  const org = await orgs().one({ id: posting.org_id });
  if (!org) throw new HiringError("This internship is no longer open.", 404);
  const file = await resumeFileStore().read(s.tenantId, input.resumeFileId);
  if (!file) throw new HiringError("Choose one of your résumés.");
  const email = s.email.trim().toLowerCase();
  if (await responses().one({ listing_id: posting.id, email })) throw new HiringError("You've already applied for this internship.", 409);
  const at = now();
  const skills = [...new Set((input.skills ?? []).map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
  const row: ResponseRow = { id: newId("rsp"), module: INTERNSHIPS, listing_id: posting.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "applied", profile: { ...profile.value, ...(skills.length ? { skills } : {}) }, cover_note: (input.coverNote ?? "").trim().slice(0, 2000), consent_at: at, created_at: at, updated_at: at };
  try {
    await responses().insert(row);
  } catch (e) {
    // The unique (listing_id, email) constraint: a second press that raced the first.
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You've already applied for this internship.", 409);
    throw e;
  }
  await files().insert({ response_id: row.id, org_id: org.id, filename: file.meta.filename, mime: file.meta.mime, ciphertext: encryptFile(fileOwner(org.id), row.id, file.bytes), created_at: at });
  await record(row, "submitted", "applicant", "Applied on WonderStar Internships");
  return { id: row.id, title: posting.title, company: org.name, notify: () => notifyTeam(row, posting.title) };
}

async function mine(s: Session, responseId: string): Promise<ResponseRow> {
  const r = await responses().one({ id: responseId, responder_tenant: s.tenantId, module: INTERNSHIPS });
  if (!r) throw new HiringError("That application isn't yours.", 404);
  return r;
}

/** The student withdraws an open application, or declines an offer. The company sees it as withdrawn. */
export async function withdrawInternship(s: Session, responseId: string): Promise<void> {
  const r = await mine(s, responseId);
  if (!canWithdraw(r.status)) throw new HiringError(`It's already ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, responder_tenant: s.tenantId, module: INTERNSHIPS, status: r.status }, { status: "withdrawn", updated_at: now() });
  if (!n) throw new HiringError("The company just changed this application. Reload and try again.", 409);
  await record(r, "status:withdrawn", "applicant", r.status === "offer" ? "Offer declined" : "Withdrawn");
}

/** The student accepts an offer. */
export async function acceptOffer(s: Session, responseId: string): Promise<void> {
  const r = await mine(s, responseId);
  if (r.status !== "offer") throw new HiringError("Only an offer can be accepted.", 409);
  const n = await responses().update({ id: r.id, responder_tenant: s.tenantId, module: INTERNSHIPS, status: "offer" }, { status: "accepted", updated_at: now() });
  if (!n) throw new HiringError("The company just changed this application. Reload and try again.", 409);
  await record(r, "status:accepted", "applicant", "Offer accepted");
}

/** The student's own applications, newest first. */
export async function myInternshipApplications(s: Session): Promise<MyInternshipApplication[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: INTERNSHIPS }, { order: "created_at", desc: true, limit: 300 });
  const posts = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: INTERNSHIPS })).map((p) => [p.id, p]));
  const names = new Map((await orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])).map((o) => [o.id, o.name]));
  return rows.map((r) => {
    const p = posts.get(r.listing_id);
    return { id: r.id, postingId: r.listing_id, title: p?.title ?? "Internship", company: names.get(r.org_id) ?? "The company", status: r.status, terms: readTerms(p?.attrs), appliedAt: r.created_at, updatedAt: r.updated_at };
  });
}

// ---- company side: applications ------------------------------------------------------------------------------


export async function orgInternshipApplications(s: Session, orgId: string): Promise<InternshipApplicationView[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: INTERNSHIPS }, { order: "created_at", desc: true, limit: 500 });
  const posts = new Map((await listings().find({ org_id: orgId, module: INTERNSHIPS })).map((p) => [p.id, p.title]));
  const withFile = new Set((await files().findIn("response_id", rows.map((r) => r.id), { org_id: orgId })).map((f) => f.response_id));
  return rows.map((r) => ({ id: r.id, postingId: r.listing_id, postingTitle: posts.get(r.listing_id) ?? "Internship", name: r.name, email: r.email, status: r.status, profile: r.profile ?? { college: "", course: "" }, coverNote: r.cover_note, hasResume: withFile.has(r.id), appliedAt: r.created_at, updatedAt: r.updated_at }));
}

/** The bell and push a student gets when a company moves their application on (as their settings allow). */
export function studentNotice(status: InternshipStatus, title: string, company: string): Notice {
  const href = "/app/m/internships/pipeline";
  switch (status) {
    case "shortlisted":
      return { category: "application_status", title: `Shortlisted by ${company}`, body: `${company} shortlisted you for ${title}.`, href, action: "Open Pipeline" };
    case "offer":
      return { category: "application_status", title: `Internship offer from ${company}`, body: `${company} offered you ${title}. Accept or decline it in Pipeline.`, href, action: "Open Pipeline" };
    default:
      return { category: "application_status", title: `Update from ${company}`, body: `${company} isn't moving forward with your application for ${title}.`, href };
  }
}

/** A hiring person moves an application on; the student hears it in the app (bell, then push). */
export async function decideInternship(s: Session, orgId: string, responseId: string, status: InternshipStatus): Promise<{ status: InternshipStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: INTERNSHIPS });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (!COMPANY_NEXT[r.status].includes(status)) throw new HiringError(`An application that's ${STATUS_LABEL[r.status].toLowerCase()} can't move to ${STATUS_LABEL[status].toLowerCase()}.`, 409);
  // Only the row still in the status we read moves, so two people deciding at once notify the student once.
  const n = await responses().update({ id: r.id, org_id: orgId, module: INTERNSHIPS, status: r.status }, { status, updated_at: now() });
  if (!n) throw new HiringError("Someone else just changed this application. Reload and try again.", 409);
  await record(r, `status:${status}`, s.tenantId);
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: INTERNSHIPS }), orgs().one({ id: orgId })]);
  try {
    await deliver(r.responder_tenant, studentNotice(status, p?.title ?? "the internship", o?.name ?? "The company"));
  } catch {
    // The decision stands; a bell or push that couldn't go is not worth failing it for.
  }
  return { status };
}

/** The résumé sent with an application, for someone in that workspace who may view applications. */
export async function internshipResume(s: Session, orgId: string, responseId: string): Promise<{ filename: string; mime: string; bytes: Buffer }> {
  await requirePermission(s, orgId, "applications.view");
  const f = await files().one({ response_id: responseId, org_id: orgId });
  if (!f) throw new HiringError("This application has no résumé file.", 404);
  return { filename: f.filename, mime: f.mime, bytes: decryptFile(fileOwner(orgId), responseId, f.ciphertext) };
}

// ---- email to the team ---------------------------------------------------------------------------------------

async function notifyTeam(r: ResponseRow, title: string): Promise<void> {
  try {
    const team = [...new Set((await members().find({ org_id: r.org_id })).filter((m) => can(m.role, "applications.decide") && m.email).map((m) => m.email!))];
    const C = EMAIL_COLORS;
    const href = new URL(`/app/m/internships/company?org=${encodeURIComponent(r.org_id)}`, siteUrl().origin).toString();
    const p = r.profile;
    const rows: [string, string][] = [
      ["College", p.college],
      ["Course", `${p.course}${p.graduationYear ? `, graduating ${p.graduationYear}` : ""}`],
      ["Available", `${p.availableFrom ?? "?"} to ${p.availableTo ?? "?"}`],
      ["Email", r.email],
    ];
    const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(`New internship application: ${r.name}`)}</div><div style="margin:0 0 10px;color:${C.ink2}">${escapeHtml(`${r.name} applied for ${title} on WonderStar Internships.`)}</div>${rows.map(([a, b]) => `<div style="padding:6px 0;border-bottom:1px solid ${C.line}"><div style="font-size:12px;color:${C.muted}">${escapeHtml(a)}</div><div style="font-size:14px;color:${C.ink}">${escapeHtml(b)}</div></div>`).join("")}<p style="margin:16px 0 0"><a href="${escapeHtml(href)}">Review the application</a></p>`;
    const bodyText = [`New internship application: ${r.name}`, "", ...rows.map(([a, b]) => `${a}: ${b}`), "", `Review the application: ${href}`].join("\n");
    const mail = renderEmailLayout({ origin: siteUrl().origin, preheader: `${r.name} applied for ${title}`, bodyHtml, bodyText, reason: "You're getting this because you can decide on applications in this hiring workspace on WonderStar.", settingsLink: false });
    let sent = 0;
    for (const to of team) if ((await sendMail({ to, subject: `New internship application for ${title}: ${r.name}`, replyTo: r.email, ...mail })).sent) sent++;
    await record(r, "email:team", "system", team.length ? `${sent} of ${team.length} sent` : "no one with an email can decide");
  } catch (e) {
    console.error("[internships] team email failed", e instanceof Error ? e.message.slice(0, 200) : e);
  }
}
