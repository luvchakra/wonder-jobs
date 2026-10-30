/**
 * WonderWorks Teaching: schools' openings and teachers' applications to them, in the platform's module-keyed
 * `listings` / `responses` tables (module = 'teaching'), on WonderWorks' shared server layer (server/modules/responses.ts).
 *
 * School side: every function takes the caller's session and checks their role in that hiring workspace on the server
 * (`requirePermission` → `domain/org/permissions.ts::can`), then filters by org_id and module.
 * Teacher side: every query filters by the session's tenant (responder_tenant) and module.
 *
 * Applying is the teacher's own press, gated by `resolveCapability("teaching.apply")` read here on the server from
 * their saved policy (a failed or missing lookup fails closed to asking), once per opening and email, and audited.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { resumeFileStore } from "../resume/files";
import { capabilityDecision, emailTeam, events, files, keepResume, listings, newId, now, orgs, readResume, record, responses as allResponses, type ListingRow, type ResponseRow as Row } from "../modules/responses";
import { canWithdraw, cleanPosting, cleanProfile, COMPANY_NEXT, gradesLabel, STATUS_LABEL, TEACHING, readTerms, type MyTeachingApplication, type MyTeachingApplicationDetail, type PostingInput, type TeacherProfile, type TeachingApplicationView, type TeachingPosting, type TeachingStatus } from "@/modules/teaching/domain";
import { toPosting } from "./listings";

type ResponseRow = Row<TeachingStatus, TeacherProfile>;
const responses = () => allResponses<TeachingStatus, TeacherProfile>();

// ---- school side: openings --------------------------------------------------------------------------------------

/** The workspace's teaching openings (jobs.view). */
export async function orgOpenings(s: Session, orgId: string): Promise<TeachingPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: TEACHING }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** Post an opening (a draft until opened), or edit one (jobs.edit). */
export async function saveOpening(s: Session, orgId: string, input: PostingInput, postingId?: string): Promise<TeachingPosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const c = cleanPosting(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const at = now();
  const fields = { title: c.value.title, description: c.value.description, location: c.value.location, work_mode: c.value.workMode, skills: [c.value.terms.subject!], attrs: { ...c.value.terms }, updated_at: at };
  if (postingId) {
    const n = await listings().update({ id: postingId, org_id: orgId, module: TEACHING }, fields);
    if (!n) throw new HiringError("That opening isn't in this workspace.", 404);
    return toPosting((await listings().one({ id: postingId, org_id: orgId, module: TEACHING }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: TEACHING, org_id: orgId, ...fields, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return toPosting(row);
}

/** Open, close or return an opening to draft (jobs.edit). */
export async function setOpeningStatus(s: Session, orgId: string, postingId: string, status: TeachingPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const n = await listings().update({ id: postingId, org_id: orgId, module: TEACHING }, { status, updated_at: now() });
  if (!n) throw new HiringError("That opening isn't in this workspace.", 404);
}

// ---- the gate --------------------------------------------------------------------------------------------------

export const applyDecision = (tenantId: string) => capabilityDecision(tenantId, "teaching.apply");

// ---- teacher side ------------------------------------------------------------------------------------------------

export interface ApplyInput {
  postingId: string;
  name: string;
  profile: unknown;
  coverNote?: string;
  resumeFileId: string;
  consent: true;
  /** The teacher saw everything and pressed Send (required when their setting is Ask me). */
  confirmed?: boolean;
}

/**
 * The teacher's application to an opening a school posted on WonderWorks: their account email, the Teaching details
 * they confirmed and a copy of the résumé they chose, into that school's applications. Once per opening and email.
 */
export async function applyToOpening(s: Session, input: ApplyInput): Promise<{ id: string; title: string; company: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to apply.", 403);
  const decision = await applyDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Teaching applications are turned off in Teaching → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your details, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const profile = cleanProfile(input.profile);
  if ("problem" in profile) throw new HiringError(profile.problem);
  const posting = await listings().one({ id: input.postingId, module: TEACHING, status: "open" });
  if (!posting) throw new HiringError("This opening is no longer open.", 404);
  const org = await orgs().one({ id: posting.org_id });
  if (!org) throw new HiringError("This opening is no longer open.", 404);
  const file = await resumeFileStore().read(s.tenantId, input.resumeFileId);
  if (!file) throw new HiringError("Choose one of your résumés.");
  const email = s.email.trim().toLowerCase();
  if (await responses().one({ listing_id: posting.id, email })) throw new HiringError("You've already applied for this opening.", 409);
  const at = now();
  const row: ResponseRow = { id: newId("rsp"), module: TEACHING, listing_id: posting.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "applied", profile: profile.value, cover_note: (input.coverNote ?? "").trim().slice(0, 2000), consent_at: at, created_at: at, updated_at: at };
  try {
    await responses().insert(row);
  } catch (e) {
    // The unique (listing_id, email) constraint: a second press that raced the first.
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You've already applied for this opening.", 409);
    throw e;
  }
  await keepResume(row, file, at);
  await record(row, "submitted", "applicant", "Applied on WonderWorks Teaching");
  return { id: row.id, title: posting.title, company: org.name, notify: () => notifyTeam(row, posting.title) };
}

async function mine(s: Session, responseId: string): Promise<ResponseRow> {
  const r = await responses().one({ id: responseId, responder_tenant: s.tenantId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't yours.", 404);
  return r;
}

/** The teacher withdraws an open application. The school sees it as withdrawn. */
export async function withdrawApplication(s: Session, responseId: string): Promise<void> {
  const r = await mine(s, responseId);
  if (!canWithdraw(r.status)) throw new HiringError(`It's already ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, responder_tenant: s.tenantId, module: TEACHING, status: r.status }, { status: "withdrawn", updated_at: now() });
  if (!n) throw new HiringError("The school just changed this application. Reload and try again.", 409);
  await record(r, "status:withdrawn", "applicant", "Withdrawn");
}

/** The teacher's own applications, newest first. */
export async function myApplications(s: Session): Promise<MyTeachingApplication[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: TEACHING }, { order: "created_at", desc: true, limit: 300 });
  const posts = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: TEACHING })).map((p) => [p.id, p]));
  const names = new Map((await orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])).map((o) => [o.id, o.name]));
  return rows.map((r) => {
    const p = posts.get(r.listing_id);
    return { id: r.id, postingId: r.listing_id, title: p?.title ?? "Teaching job", company: names.get(r.org_id) ?? "The school", status: r.status, terms: readTerms(p?.attrs), appliedAt: r.created_at, updatedAt: r.updated_at };
  });
}

/** One of the teacher's own applications, with what they sent and its history (never the team's own events). */
export async function myApplication(s: Session, responseId: string): Promise<MyTeachingApplicationDetail> {
  const r = await mine(s, responseId);
  const [p, org, history, file] = await Promise.all([listings().one({ id: r.listing_id, module: TEACHING }), orgs().one({ id: r.org_id }), events().find({ response_id: r.id, org_id: r.org_id }, { order: "at" }), files().one({ response_id: r.id, org_id: r.org_id })]);
  const evs = history.flatMap((e, i) => {
    const status = e.event === "submitted" ? "applied" : e.event.startsWith("status:") ? (e.event.slice(7) as TeachingStatus) : null;
    return status && status in STATUS_LABEL ? [{ id: String(i), status, ...(e.actor === "applicant" && e.event !== "submitted" && e.detail ? { detail: e.detail } : {}), at: e.at }] : [];
  });
  return {
    id: r.id,
    postingId: r.listing_id,
    title: p?.title ?? "Teaching job",
    company: org?.name ?? "The school",
    status: r.status,
    terms: readTerms(p?.attrs),
    appliedAt: r.created_at,
    updatedAt: r.updated_at,
    location: p?.location ?? "",
    workMode: p?.work_mode ?? "onsite",
    description: p?.description ?? "",
    sent: { name: r.name, email: r.email, profile: r.profile, coverNote: r.cover_note, ...(file ? { resume: file.filename } : {}) },
    events: evs.length ? evs : [{ id: "0", status: "applied", at: r.created_at }],
  };
}

// ---- school side: applications -------------------------------------------------------------------------------------

export async function orgApplications(s: Session, orgId: string): Promise<TeachingApplicationView[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: TEACHING }, { order: "created_at", desc: true, limit: 500 });
  const posts = new Map((await listings().find({ org_id: orgId, module: TEACHING })).map((p) => [p.id, p.title]));
  const withFile = new Set((await files().findIn("response_id", rows.map((r) => r.id), { org_id: orgId })).map((f) => f.response_id));
  return rows.map((r) => ({ id: r.id, postingId: r.listing_id, postingTitle: posts.get(r.listing_id) ?? "Teaching job", name: r.name, email: r.email, status: r.status, profile: r.profile, coverNote: r.cover_note, hasResume: withFile.has(r.id), appliedAt: r.created_at, updatedAt: r.updated_at }));
}

/** The bell and push a teacher gets when a school moves their application on (as their settings allow). */
export function teacherNotice(status: TeachingStatus, title: string, school: string): Notice {
  const href = "/app/m/teaching/pipeline";
  if (status === "appointed") return { category: "application_status", module: TEACHING, title: `Appointed by ${school}`, body: `${school} appointed you for ${title}.`, href, action: "Open Pipeline" };
  return { category: "application_status", module: TEACHING, title: `Update from ${school}`, body: `${school} isn't moving forward with your application for ${title}.`, href };
}

/** A hiring person moves an application on (applications.decide); the teacher hears it in the app. */
export async function decideApplication(s: Session, orgId: string, responseId: string, status: TeachingStatus): Promise<{ status: TeachingStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: TEACHING });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (!COMPANY_NEXT[r.status].includes(status)) throw new HiringError(`An application that's ${STATUS_LABEL[r.status].toLowerCase()} can't move to ${STATUS_LABEL[status].toLowerCase()}.`, 409);
  // Only the row still in the status we read moves, so two people deciding at once notify the teacher once.
  const n = await responses().update({ id: r.id, org_id: orgId, module: TEACHING, status: r.status }, { status, updated_at: now() });
  if (!n) throw new HiringError("Someone else just changed this application. Reload and try again.", 409);
  await record(r, `status:${status}`, s.tenantId);
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: TEACHING }), orgs().one({ id: orgId })]);
  try {
    await deliver(r.responder_tenant, teacherNotice(status, p?.title ?? "the teaching job", o?.name ?? "The school"));
  } catch {
    // The decision stands; a bell or push that couldn't go is not worth failing it for.
  }
  return { status };
}

/** The résumé sent with an application, for someone in that workspace who may view applications. */
export async function applicationResume(s: Session, orgId: string, responseId: string): Promise<{ filename: string; mime: string; bytes: Buffer }> {
  await requirePermission(s, orgId, "applications.view");
  const f = await readResume(orgId, TEACHING, responseId);
  if (!f) throw new HiringError("This application has no résumé file.", 404);
  return f;
}

function notifyTeam(r: ResponseRow, title: string): Promise<void> {
  const p = r.profile;
  return emailTeam(r, {
    tag: "teaching",
    subject: `New teaching application for ${title}: ${r.name}`,
    heading: `New teaching application: ${r.name}`,
    intro: `${r.name} applied for ${title} on WonderWorks Teaching.`,
    rows: [
      ["Subjects", p.subjects.join(", ")],
      ["Grade levels", gradesLabel(p.grades)],
      ...(p.boards.length ? ([["Boards", p.boards.join(", ")]] as [string, string][]) : []),
      ...(p.qualifications.length ? ([["Qualifications", p.qualifications.join(", ")]] as [string, string][]) : []),
      ["Email", r.email],
    ],
    href: `/app/m/teaching/company?org=${encodeURIComponent(r.org_id)}`,
  });
}
