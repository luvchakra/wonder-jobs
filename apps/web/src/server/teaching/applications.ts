/**
 * WonderStar Teaching (WJ-420): schools' teaching roles, teachers' applications and demo-class bookings, in the
 * platform's module-keyed `listings` / `responses` / `bookings` tables (module = 'teaching'), apart from Jobs' tables.
 *
 * School side: every function checks the caller's role in that hiring workspace on the server (`requirePermission` →
 * `domain/org/permissions.ts::can`), then filters by org_id and module. Only an organisation's workspace posts (the
 * `minors` safeguard "organisation_owners_only"): there is no posting by a private individual.
 * Teacher side: every query filters by the session's tenant (responder_tenant) and module.
 * The one cross-tenant read is open roles, which are public.
 *
 * Applying is the teacher's own press, gated by `resolveCapability("teaching.apply")` read here on the server from their
 * saved policy (a failed or missing lookup fails closed to asking), once per role and email, and audited. Their own
 * statement about a background check goes with every application (the `minors` safeguard "background_check_disclosed").
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
  cleanBooking,
  cleanPosting,
  cleanProfile,
  readTerms,
  SCHOOL_NEXT,
  shortDateTime,
  STATUS_LABEL,
  TEACHING,
  type BookingInput,
  type BookingStatus,
  type DemoBooking,
  type MyTeachingApplication,
  type PostingInput,
  type TeacherProfile,
  type TeachingApplicationView,
  type TeachingPosting,
  type TeachingStatus,
} from "@/modules/teaching/domain";

// ---- rows ----------------------------------------------------------------------------------------------------
type ListingRow = { id: string; module: string; org_id: string; title: string; description: string; location: string; work_mode: TeachingPosting["workMode"]; skills: string[]; attrs: Record<string, unknown>; status: TeachingPosting["status"]; created_by: string; created_at: string; updated_at: string };
type ResponseRow = { id: string; module: string; listing_id: string; org_id: string; responder_tenant: string; email: string; name: string; status: TeachingStatus; profile: TeacherProfile & { skills?: string[] }; cover_note: string; consent_at: string; created_at: string; updated_at: string };
type BookingRow = { id: string; module: string; response_id: string; org_id: string; responder_tenant: string; starts_at: string; duration_min: number; mode: DemoBooking["mode"]; location: string; note: string; status: BookingStatus; created_by: string; created_at: string; updated_at: string };
type EventRow = { response_id: string; org_id: string; event: string; actor: string | null; detail: string | null; at: string };
type FileRow = { response_id: string; org_id: string; filename: string; mime: string; ciphertext: string; created_at: string };
type OrgRow = { id: string; name: string; website: string | null; verified?: boolean };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; email: string | null };

const listings = () => table<ListingRow>("listings");
const responses = () => table<ResponseRow>("responses");
const bookings = () => table<BookingRow>("bookings");
const events = () => table<EventRow>("response_events");
const files = () => table<FileRow>("response_files");
const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");

const now = () => new Date().toISOString();
const newId = (p: string) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const fileOwner = (orgId: string) => `org:${orgId}:teaching`;

const toPosting = (r: ListingRow): TeachingPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, skills: r.skills ?? [], terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const toBooking = (b: BookingRow): DemoBooking => ({ id: b.id, responseId: b.response_id, startsAt: b.starts_at, durationMin: b.duration_min, mode: b.mode, where: b.location, note: b.note, status: b.status, updatedAt: b.updated_at });

async function record(r: Pick<ResponseRow, "id" | "org_id">, event: string, actor: string | null, detail?: string) {
  await events().insert({ response_id: r.id, org_id: r.org_id, event, actor, detail: detail ?? null, at: now() });
}

async function tell(tenantId: string, notice: Notice) {
  try {
    await deliver(tenantId, notice);
  } catch {
    // The change stands; a bell or push that couldn't go is not worth failing it for.
  }
}

// ---- school side: roles --------------------------------------------------------------------------------------

export async function orgTeachingRoles(s: Session, orgId: string): Promise<TeachingPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: TEACHING }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** Post (as a draft) or edit a teaching role. Only Teaching's own form; Jobs' job form is untouched. */
export async function saveTeachingRole(s: Session, orgId: string, input: PostingInput, postingId?: string): Promise<TeachingPosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const clean = cleanPosting(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const v = clean.value;
  const at = now();
  const fields = { title: v.title, description: v.description, location: v.location, work_mode: v.workMode, skills: v.skills, attrs: { ...v.terms }, updated_at: at };
  if (postingId) {
    const n = await listings().update({ id: postingId, org_id: orgId, module: TEACHING }, fields);
    if (!n) throw new HiringError("That role isn't in this workspace.", 404);
    return toPosting((await listings().one({ id: postingId, org_id: orgId, module: TEACHING }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: TEACHING, org_id: orgId, ...fields, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return toPosting(row);
}

export async function setTeachingRoleStatus(s: Session, orgId: string, postingId: string, status: TeachingPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const n = await listings().update({ id: postingId, org_id: orgId, module: TEACHING }, { status, updated_at: now() });
  if (!n) throw new HiringError("That role isn't in this workspace.", 404);
}

/** Every open teaching role with its school (public postings: the one cross-tenant read). */
export async function openTeachingRoles(limit = 300): Promise<{ posting: TeachingPosting; org: { id: string; name: string; verified: boolean } }[]> {
  const rows = (await listings().find({ module: TEACHING, status: "open" }, { order: "updated_at", desc: true, limit })).map(toPosting);
  const byOrg = new Map((await orgs().findIn("id", [...new Set(rows.map((p) => p.orgId))])).map((o) => [o.id, o]));
  return rows.flatMap((posting) => {
    const o = byOrg.get(posting.orgId);
    return o ? [{ posting, org: { id: o.id, name: o.name, verified: !!o.verified } }] : [];
  });
}

// ---- the gate ------------------------------------------------------------------------------------------------

/** `resolveCapability("teaching.apply")` for this teacher, from their saved policy. No saved policy, or a failed read: ask. */
export async function applyDecision(tenantId: string): Promise<"run" | "ask" | "skip"> {
  try {
    const st = await readClientState<{ policy?: Partial<AutomationPolicy>; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation");
    if (!st?.policy) return "ask";
    return resolveCapability("teaching.apply", { ...defaultPolicy(), ...st.policy }, st.defaultLevel ?? "guided");
  } catch {
    return "ask";
  }
}

// ---- teacher side --------------------------------------------------------------------------------------------

export interface ApplyInput {
  postingId: string;
  name: string;
  profile: unknown;
  skills?: string[];
  coverNote?: string;
  resumeFileId: string;
  consent: true;
  confirmed?: boolean;
}

/**
 * The teacher's application to a role a school posted on WonderStar: their account email, the Teaching profile they
 * confirmed (subjects, grades, boards, qualifications, languages, their background-check statement), their skills and
 * a copy of the résumé they chose, into that school's applications. Once per role and email.
 */
export async function applyToTeachingRole(s: Session, input: ApplyInput): Promise<{ id: string; title: string; company: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to apply.", 403);
  const decision = await applyDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Teaching applications are turned off in Teaching → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your details, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const profile = cleanProfile(input.profile);
  if ("problem" in profile) throw new HiringError(profile.problem);
  const posting = await listings().one({ id: input.postingId, module: TEACHING, status: "open" });
  if (!posting) throw new HiringError("This role is no longer open.", 404);
  const org = await orgs().one({ id: posting.org_id });
  if (!org) throw new HiringError("This role is no longer open.", 404);
  const file = await resumeFileStore().read(s.tenantId, input.resumeFileId);
  if (!file) throw new HiringError("Choose one of your résumés.");
  const email = s.email.trim().toLowerCase();
  if (await responses().one({ listing_id: posting.id, email })) throw new HiringError("You've already applied for this role.", 409);
  const at = now();
  const skills = [...new Set((input.skills ?? []).map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 30);
  const row: ResponseRow = { id: newId("rsp"), module: TEACHING, listing_id: posting.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "applied", profile: { ...profile.value, ...(skills.length ? { skills } : {}) }, cover_note: (input.coverNote ?? "").trim().slice(0, 2000), consent_at: at, created_at: at, updated_at: at };
  try {
    await responses().insert(row);
  } catch (e) {
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You've already applied for this role.", 409);
    throw e;
  }
  await files().insert({ response_id: row.id, org_id: org.id, filename: file.meta.filename, mime: file.meta.mime, ciphertext: encryptFile(fileOwner(org.id), row.id, file.bytes), created_at: at });
  await record(row, "submitted", "applicant", "Applied on WonderStar Teaching");
  return { id: row.id, title: posting.title, company: org.name, notify: () => notifyTeam(row, posting.title) };
}

async function mine(s: Session, responseId: string): Promise<ResponseRow> {
  const r = await responses().one({ id: responseId, responder_tenant: s.tenantId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't yours.", 404);
  return r;
}

/** The teacher withdraws an application before they're appointed; any demo class not yet held is cancelled. */
export async function withdrawTeaching(s: Session, responseId: string): Promise<void> {
  const r = await mine(s, responseId);
  if (!canWithdraw(r.status)) throw new HiringError(`It's already ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, responder_tenant: s.tenantId, module: TEACHING, status: r.status }, { status: "withdrawn", updated_at: now() });
  if (!n) throw new HiringError("The school just changed this application. Reload and try again.", 409);
  for (const b of await bookings().find({ response_id: r.id, responder_tenant: s.tenantId, module: TEACHING })) if (b.status === "proposed" || b.status === "confirmed") await bookings().update({ id: b.id, responder_tenant: s.tenantId, module: TEACHING }, { status: "cancelled", updated_at: now() });
  await record(r, "status:withdrawn", "applicant", "Withdrawn");
}

/** The teacher confirms or declines a demo class the school proposed. The school's team hears it. */
export async function answerDemo(s: Session, bookingId: string, answer: "confirmed" | "declined"): Promise<void> {
  const b = await bookings().one({ id: bookingId, responder_tenant: s.tenantId, module: TEACHING });
  if (!b) throw new HiringError("That demo class isn't yours.", 404);
  if (b.status !== "proposed") throw new HiringError(`It's already ${b.status}.`, 409);
  const n = await bookings().update({ id: b.id, responder_tenant: s.tenantId, module: TEACHING, status: "proposed" }, { status: answer, updated_at: now() });
  if (!n) throw new HiringError("The school just changed this demo class. Reload and try again.", 409);
  const r = await responses().one({ id: b.response_id, responder_tenant: s.tenantId, module: TEACHING });
  if (r) {
    await record(r, `demo:${answer}`, "applicant", shortDateTime(b.starts_at));
    const notice: Notice = { category: "application_status", title: `Demo class ${answer} by ${r.name}`, body: `${r.name} ${answer} the demo class on ${shortDateTime(b.starts_at)} IST.`, href: `/app/m/teaching/school?org=${encodeURIComponent(r.org_id)}` };
    await tell(b.created_by, notice);
  }
}

/** The teacher's own applications with their demo classes, newest first. */
export async function myTeachingApplications(s: Session): Promise<MyTeachingApplication[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: TEACHING }, { order: "created_at", desc: true, limit: 300 });
  const ids = rows.map((r) => r.id);
  const [posts, names, books] = await Promise.all([
    listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: TEACHING }),
    orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))]),
    bookings().findIn("response_id", ids, { responder_tenant: s.tenantId, module: TEACHING }, { order: "starts_at" }),
  ]);
  const post = new Map(posts.map((p) => [p.id, p]));
  const name = new Map(names.map((o) => [o.id, o.name]));
  return rows.map((r) => {
    const p = post.get(r.listing_id);
    return { id: r.id, postingId: r.listing_id, title: p?.title ?? "Teaching role", company: name.get(r.org_id) ?? "The school", status: r.status, terms: readTerms(p?.attrs), appliedAt: r.created_at, updatedAt: r.updated_at, bookings: books.filter((b) => b.response_id === r.id).map(toBooking) };
  });
}

// ---- school side: applications and demo classes --------------------------------------------------------------

export async function orgTeachingApplications(s: Session, orgId: string): Promise<TeachingApplicationView[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: TEACHING }, { order: "created_at", desc: true, limit: 500 });
  const ids = rows.map((r) => r.id);
  const [posts, withFile, books] = await Promise.all([listings().find({ org_id: orgId, module: TEACHING }), files().findIn("response_id", ids, { org_id: orgId }), bookings().findIn("response_id", ids, { org_id: orgId, module: TEACHING }, { order: "starts_at" })]);
  const title = new Map(posts.map((p) => [p.id, p.title]));
  const hasFile = new Set(withFile.map((f) => f.response_id));
  return rows.map((r) => ({ id: r.id, postingId: r.listing_id, postingTitle: title.get(r.listing_id) ?? "Teaching role", name: r.name, email: r.email, status: r.status, profile: r.profile, coverNote: r.cover_note, hasResume: hasFile.has(r.id), appliedAt: r.created_at, updatedAt: r.updated_at, bookings: books.filter((b) => b.response_id === r.id).map(toBooking) }));
}

/** The school proposes a demo class on an application (applications.decide); the application moves to Demo class and the teacher is told. */
export async function proposeDemo(s: Session, orgId: string, responseId: string, input: BookingInput): Promise<DemoBooking> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (r.status !== "applied" && r.status !== "demo_class") throw new HiringError(`An application that's ${STATUS_LABEL[r.status].toLowerCase()} can't have a demo class.`, 409);
  const open = (await bookings().find({ response_id: r.id, org_id: orgId, module: TEACHING })).find((b) => b.status === "proposed" || b.status === "confirmed");
  if (open) throw new HiringError("This application already has a demo class booked. Cancel it first.", 409);
  const clean = cleanBooking(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const v = clean.value;
  const at = now();
  const row: BookingRow = { id: newId("bkg"), module: TEACHING, response_id: r.id, org_id: orgId, responder_tenant: r.responder_tenant, starts_at: v.startsAt, duration_min: v.durationMin, mode: v.mode, location: v.where, note: v.note, status: "proposed", created_by: s.tenantId, created_at: at, updated_at: at };
  await bookings().insert(row);
  if (r.status === "applied") await responses().update({ id: r.id, org_id: orgId, module: TEACHING, status: "applied" }, { status: "demo_class", updated_at: at });
  await record(r, "demo:proposed", s.tenantId, shortDateTime(v.startsAt));
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: TEACHING }), orgs().one({ id: orgId })]);
  const school = o?.name ?? "The school";
  await tell(r.responder_tenant, { category: "interview_upcoming", title: `Demo class with ${school}`, body: `${school} invited you to a ${v.durationMin}-minute demo class for ${p?.title ?? "the role"} on ${shortDateTime(v.startsAt)} IST. Confirm or decline it in Pipeline.`, href: "/app/m/teaching/pipeline", action: "Open Pipeline" });
  return toBooking(row);
}

/** The school marks a demo class held, or cancels it (applications.decide). */
export async function setDemoStatus(s: Session, orgId: string, bookingId: string, status: "held" | "cancelled"): Promise<void> {
  await requirePermission(s, orgId, "applications.decide");
  const b = await bookings().one({ id: bookingId, org_id: orgId, module: TEACHING });
  if (!b) throw new HiringError("That demo class isn't in this workspace.", 404);
  const from: BookingStatus[] = status === "held" ? ["confirmed"] : ["proposed", "confirmed"];
  if (!from.includes(b.status)) throw new HiringError(`A ${b.status} demo class can't be marked ${status}.`, 409);
  const n = await bookings().update({ id: b.id, org_id: orgId, module: TEACHING, status: b.status }, { status, updated_at: now() });
  if (!n) throw new HiringError("Someone just changed this demo class. Reload and try again.", 409);
  const r = await responses().one({ id: b.response_id, org_id: orgId, module: TEACHING });
  if (r) {
    await record(r, `demo:${status}`, s.tenantId, shortDateTime(b.starts_at));
    if (status === "cancelled") await tell(r.responder_tenant, { category: "application_status", title: "Demo class cancelled", body: `The demo class on ${shortDateTime(b.starts_at)} IST was cancelled by the school.`, href: "/app/m/teaching/pipeline" });
  }
}

/** What a teacher's bell says when a school appoints them or closes their application. */
export function teacherNotice(status: TeachingStatus, title: string, school: string): Notice {
  return status === "appointed"
    ? { category: "application_status", title: `Appointed by ${school}`, body: `${school} appointed you for ${title}.`, href: "/app/m/teaching/pipeline", action: "Open Pipeline" }
    : { category: "application_status", title: `Update from ${school}`, body: `${school} isn't moving forward with your application for ${title}.`, href: "/app/m/teaching/pipeline" };
}

/** The school appoints the teacher or closes the application (applications.decide); the teacher hears it in the app. */
export async function decideTeaching(s: Session, orgId: string, responseId: string, status: TeachingStatus): Promise<{ status: TeachingStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (!SCHOOL_NEXT[r.status].includes(status)) throw new HiringError(`An application that's ${STATUS_LABEL[r.status].toLowerCase()} can't move to ${STATUS_LABEL[status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, org_id: orgId, module: TEACHING, status: r.status }, { status, updated_at: now() });
  if (!n) throw new HiringError("Someone else just changed this application. Reload and try again.", 409);
  await record(r, `status:${status}`, s.tenantId);
  if (status === "closed") for (const b of await bookings().find({ response_id: r.id, org_id: orgId, module: TEACHING })) if (b.status === "proposed" || b.status === "confirmed") await bookings().update({ id: b.id, org_id: orgId, module: TEACHING }, { status: "cancelled", updated_at: now() });
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: TEACHING }), orgs().one({ id: orgId })]);
  await tell(r.responder_tenant, teacherNotice(status, p?.title ?? "the role", o?.name ?? "The school"));
  return { status };
}

export async function teachingResume(s: Session, orgId: string, responseId: string): Promise<{ filename: string; mime: string; bytes: Buffer }> {
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
    const href = new URL(`/app/m/teaching/school?org=${encodeURIComponent(r.org_id)}`, siteUrl().origin).toString();
    const p = r.profile;
    const bc = p.backgroundCheck?.has ? `Yes, they say${p.backgroundCheck.on ? ` (${p.backgroundCheck.on})` : ""}` : "No, they say";
    const rows: [string, string][] = [
      ["Subjects", p.subjects.join(", ")],
      ["Grades", p.grades.join(", ")],
      ["Boards", p.boards.join(", ")],
      ["Qualifications", p.qualifications.join(", ") || "None given"],
      ["Police verification / background check", bc],
      ["Email", r.email],
    ];
    const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(`New teaching application: ${r.name}`)}</div><div style="margin:0 0 10px;color:${C.ink2}">${escapeHtml(`${r.name} applied for ${title} on WonderStar Teaching.`)}</div>${rows.map(([a, b]) => `<div style="padding:6px 0;border-bottom:1px solid ${C.line}"><div style="font-size:12px;color:${C.muted}">${escapeHtml(a)}</div><div style="font-size:14px;color:${C.ink}">${escapeHtml(b)}</div></div>`).join("")}<p style="margin:16px 0 0"><a href="${escapeHtml(href)}">Review the application</a></p>`;
    const bodyText = [`New teaching application: ${r.name}`, "", ...rows.map(([a, b]) => `${a}: ${b}`), "", `Review the application: ${href}`].join("\n");
    const mail = renderEmailLayout({ origin: siteUrl().origin, preheader: `${r.name} applied for ${title}`, bodyHtml, bodyText, reason: "You're getting this because you can decide on applications in this hiring workspace on WonderStar.", settingsLink: false });
    let sent = 0;
    for (const to of team) if ((await sendMail({ to, subject: `New teaching application for ${title}: ${r.name}`, replyTo: r.email, ...mail })).sent) sent++;
    await record(r, "email:team", "system", team.length ? `${sent} of ${team.length} sent` : "no one with an email can decide");
  } catch (e) {
    console.error("[teaching] team email failed", e instanceof Error ? e.message.slice(0, 200) : e);
  }
}
