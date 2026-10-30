/**
 * WonderWorks Internships (WJ-418): companies' internship postings and students' applications to them, in the
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
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { resumeFileStore } from "../resume/files";
import { capabilityDecision, emailTeam, events, files, keepResume, listings as allListings, newId, now, openListings, orgs, readResume, record, responses as allResponses, type ListingRow as SharedListingRow, type ResponseRow as SharedResponseRow } from "../modules/responses";
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
  type MyInternshipApplicationDetail,
  type PostingInput,
  type StudentProfile,
} from "@/modules/internships/domain";

// ---- rows ----------------------------------------------------------------------------------------------------
export type ListingRow = SharedListingRow;
type ResponseRow = SharedResponseRow<InternshipStatus, StudentProfile & { skills?: string[] }>;

const listings = allListings;
const responses = () => allResponses<InternshipStatus, StudentProfile & { skills?: string[] }>();

export const toPosting = (r: ListingRow): InternshipPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, skills: r.skills ?? [], terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

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
  return (await openListings(INTERNSHIPS, toPosting, limit)).filter((p) => stillOpen(p.posting.terms));
}

// ---- the gate ------------------------------------------------------------------------------------------------

/** `resolveCapability("internships.apply")` for this student, from their saved policy. No saved policy, or a failed read: ask. */
export const applyDecision = (tenantId: string) => capabilityDecision(tenantId, "internships.apply");

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
 * The student's application to an internship posted on WonderWorks: their account email, the profile they confirmed
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
  await keepResume(row, file, at);
  await record(row, "submitted", "applicant", "Applied on WonderWorks Internships");
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

/**
 * One of the student's own applications, with what they sent and its history. Filtered by their tenant; the history
 * holds only Applied and status moves, never the team's own events (emails to the team) or who on the team acted.
 */
export async function myInternshipApplication(s: Session, responseId: string): Promise<MyInternshipApplicationDetail> {
  const r = await mine(s, responseId);
  const [p, org, history, file] = await Promise.all([listings().one({ id: r.listing_id, module: INTERNSHIPS }), orgs().one({ id: r.org_id }), events().find({ response_id: r.id, org_id: r.org_id }, { order: "at" }), files().one({ response_id: r.id, org_id: r.org_id })]);
  const evs = history.flatMap((e, i) => {
    const status = e.event === "submitted" ? "applied" : e.event.startsWith("status:") ? (e.event.slice(7) as InternshipStatus) : null;
    return status && status in STATUS_LABEL ? [{ id: String(i), status, ...(e.actor === "applicant" && e.event !== "submitted" && e.detail ? { detail: e.detail } : {}), at: e.at }] : [];
  });
  const sentProfile = r.profile ?? { college: "", course: "" };
  return {
    id: r.id,
    postingId: r.listing_id,
    title: p?.title ?? "Internship",
    company: org?.name ?? "The company",
    status: r.status,
    terms: readTerms(p?.attrs),
    appliedAt: r.created_at,
    updatedAt: r.updated_at,
    location: p?.location ?? "",
    workMode: p?.work_mode ?? "onsite",
    description: p?.description ?? "",
    sent: { name: r.name, email: r.email, profile: { college: sentProfile.college, course: sentProfile.course, ...(sentProfile.graduationYear ? { graduationYear: sentProfile.graduationYear } : {}) }, coverNote: r.cover_note, ...(file ? { resume: file.filename } : {}) },
    events: evs.length ? evs : [{ id: "0", status: "applied", at: r.created_at }],
  };
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
      return { category: "application_status", module: INTERNSHIPS, title: `Shortlisted by ${company}`, body: `${company} shortlisted you for ${title}.`, href, action: "Open Pipeline" };
    case "offer":
      return { category: "application_status", module: INTERNSHIPS, title: `Internship offer from ${company}`, body: `${company} offered you ${title}. Accept or decline it in Pipeline.`, href, action: "Open Pipeline" };
    default:
      return { category: "application_status", module: INTERNSHIPS, title: `Update from ${company}`, body: `${company} isn't moving forward with your application for ${title}.`, href };
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
  const f = await readResume(orgId, INTERNSHIPS, responseId);
  if (!f) throw new HiringError("This application has no résumé file.", 404);
  return f;
}

// ---- email to the team ---------------------------------------------------------------------------------------

async function notifyTeam(r: ResponseRow, title: string): Promise<void> {
  const p = r.profile;
  await emailTeam(r, {
    tag: "internships",
    subject: `New internship application for ${title}: ${r.name}`,
    heading: `New internship application: ${r.name}`,
    intro: `${r.name} applied for ${title} on WonderWorks Internships.`,
    rows: [
      ["College", p.college],
      ["Course", `${p.course}${p.graduationYear ? `, graduating ${p.graduationYear}` : ""}`],
      ["Available", `${p.availableFrom ?? "?"} to ${p.availableTo ?? "?"}`],
      ["Email", r.email],
    ],
    href: `/app/m/internships/company?org=${encodeURIComponent(r.org_id)}`,
  });
}
