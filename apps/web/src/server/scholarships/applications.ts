/**
 * WonderWorks Scholarships & Projects: organisations' scholarships and projects and students' applications to them, in
 * the platform's module-keyed `listings` / `responses` tables (module = 'scholarships'), apart from every other
 * module's rows.
 *
 * Organisation side: every function checks the caller's role in that hiring workspace on the server
 * (`requirePermission` → `domain/org/permissions.ts::can`), then filters by org_id and module.
 * Student side: every query filters by the session's tenant (responder_tenant) and module.
 * The one cross-tenant read is open listings, which are public.
 *
 * Applying is the student's own press, gated by `resolveCapability("scholarships.apply")` read here on the server
 * (missing or failed lookup: ask), once per listing and email, and audited by the route. Income, gender and category
 * reach the organisation only when the student shares them for this application (`profileForProvider`).
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { resumeFileStore } from "../resume/files";
import { capabilityDecision, emailTeam, events, files, keepResume, listings, newId, now, openListings, orgs, readResume, record, responses as allResponses, type ListingRow, type ResponseRow } from "../modules/responses";
import {
  canWithdraw,
  cleanAnswers,
  cleanPosting,
  cleanProfile,
  cleanQuestions,
  KIND_LABEL,
  LEVEL_LABEL,
  profileForProvider,
  PROVIDER_NEXT,
  readTerms,
  SCHOLARSHIPS,
  STATUS_LABEL,
  stillOpen,
  type MyScholarshipApplication,
  type MyScholarshipApplicationDetail,
  type PostingInput,
  type ScholarshipApplicationView,
  type ScholarshipPosting,
  type ScholarshipStatus,
  type StudentProfile,
} from "@/modules/scholarships/domain";

type Sent = StudentProfile & { answers?: { question: string; answer: string }[] };
const responses = () => allResponses<ScholarshipStatus, Sent>();

export const toPosting = (r: ListingRow): ScholarshipPosting => {
  const terms = readTerms(r.attrs);
  return { id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, skills: r.skills ?? [], terms, questions: cleanQuestions((r.attrs as { questions?: unknown })?.questions), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
};

const noun = (r: { attrs: Record<string, unknown> } | null | undefined) => KIND_LABEL[readTerms(r?.attrs).kind].toLowerCase();

// ---- organisation side: listings -------------------------------------------------------------------------------

export async function orgScholarships(s: Session, orgId: string): Promise<ScholarshipPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: SCHOLARSHIPS }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** Post (as a draft) or edit a scholarship or project. Refused when it charges a fee to apply or lacks an official link. */
export async function saveScholarship(s: Session, orgId: string, input: PostingInput, postingId?: string): Promise<ScholarshipPosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const clean = cleanPosting(input);
  if ("problem" in clean) throw new HiringError(clean.problem);
  const v = clean.value;
  const at = now();
  const fields = { title: v.title, description: v.description, location: v.location, work_mode: v.workMode, skills: v.skills, attrs: { ...v.terms, questions: v.questions }, updated_at: at };
  if (postingId) {
    const n = await listings().update({ id: postingId, org_id: orgId, module: SCHOLARSHIPS }, fields);
    if (!n) throw new HiringError("That listing isn't in this workspace.", 404);
    return toPosting((await listings().one({ id: postingId, org_id: orgId, module: SCHOLARSHIPS }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: SCHOLARSHIPS, org_id: orgId, ...fields, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return toPosting(row);
}

/** Open, close or return to draft. One whose deadline has passed can't be opened. */
export async function setScholarshipStatus(s: Session, orgId: string, postingId: string, status: ScholarshipPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const r = await listings().one({ id: postingId, org_id: orgId, module: SCHOLARSHIPS });
  if (!r) throw new HiringError("That listing isn't in this workspace.", 404);
  if (status === "open" && !stillOpen(readTerms(r.attrs))) throw new HiringError("Its deadline has passed. Change the date first.", 409);
  await listings().update({ id: postingId, org_id: orgId, module: SCHOLARSHIPS }, { status, updated_at: now() });
}

/** Every open listing before its deadline, with its organisation (public listings: the one cross-tenant read). */
export async function openScholarships(limit = 300) {
  return (await openListings(SCHOLARSHIPS, toPosting, limit)).filter((p) => stillOpen(p.posting.terms));
}

// ---- student side ----------------------------------------------------------------------------------------------

export const applyDecision = (tenantId: string) => capabilityDecision(tenantId, "scholarships.apply");

export interface ApplyInput {
  postingId: string;
  name: string;
  profile: unknown;
  answers?: Record<string, string>;
  statement?: string;
  /** Share income, gender and category with this organisation (only when the profile holds them by consent). */
  shareSensitive?: boolean;
  resumeFileId?: string;
  consent: true;
  confirmed?: boolean;
}

/**
 * The student's application to a scholarship or project posted on WonderWorks: their account email, the profile they
 * confirmed, answers to the organisation's questions, an optional statement and résumé copy. Once per listing and email.
 */
export async function applyToScholarship(s: Session, input: ApplyInput): Promise<{ id: string; title: string; company: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to apply.", 403);
  const decision = await applyDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Applications are turned off in Scholarships & Projects → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your details, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const profile = cleanProfile(input.profile);
  if ("problem" in profile) throw new HiringError(profile.problem);
  const posting = await listings().one({ id: input.postingId, module: SCHOLARSHIPS, status: "open" });
  if (!posting || !stillOpen(readTerms(posting.attrs))) throw new HiringError("This is no longer open.", 404);
  const p = toPosting(posting);
  if (p.terms.levels?.length && profile.value.level && !p.terms.levels.includes(profile.value.level)) throw new HiringError(`This is for ${p.terms.levels.map((l) => LEVEL_LABEL[l]).join(", ")} students.`, 409);
  const answers = cleanAnswers(p.questions, input.answers);
  if ("problem" in answers) throw new HiringError(answers.problem);
  const org = await orgs().one({ id: posting.org_id });
  if (!org) throw new HiringError("This is no longer open.", 404);
  const file = input.resumeFileId ? await resumeFileStore().read(s.tenantId, input.resumeFileId) : null;
  if (input.resumeFileId && !file) throw new HiringError("Choose one of your résumés.");
  const email = s.email.trim().toLowerCase();
  if (await responses().one({ listing_id: posting.id, email })) throw new HiringError("You've already applied.", 409);
  const at = now();
  const sent: Sent = { ...profileForProvider(profile.value, input.shareSensitive === true), ...(answers.value.length ? { answers: answers.value } : {}) };
  const row: ResponseRow<ScholarshipStatus, Sent> = { id: newId("rsp"), module: SCHOLARSHIPS, listing_id: posting.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "applied", profile: sent, cover_note: (input.statement ?? "").trim().slice(0, 4000), consent_at: at, created_at: at, updated_at: at };
  try {
    await responses().insert(row);
  } catch (e) {
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You've already applied.", 409);
    throw e;
  }
  if (file) await keepResume(row, file, at);
  await record(row, "submitted", "applicant", "Applied on WonderWorks Scholarships & Projects");
  return { id: row.id, title: posting.title, company: org.name, notify: () => notifyTeam(row, posting.title) };
}

async function mine(s: Session, responseId: string) {
  const r = await responses().one({ id: responseId, responder_tenant: s.tenantId, module: SCHOLARSHIPS });
  if (!r) throw new HiringError("That application isn't yours.", 404);
  return r;
}

/** The student withdraws an open application. */
export async function withdrawScholarship(s: Session, responseId: string): Promise<void> {
  const r = await mine(s, responseId);
  if (!canWithdraw(r.status)) throw new HiringError(`It's already ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, responder_tenant: s.tenantId, module: SCHOLARSHIPS, status: r.status }, { status: "withdrawn", updated_at: now() });
  if (!n) throw new HiringError("The organisation just changed this application. Reload and try again.", 409);
  await record(r, "status:withdrawn", "applicant", "Withdrawn");
}

export async function myScholarshipApplications(s: Session): Promise<MyScholarshipApplication[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: SCHOLARSHIPS }, { order: "created_at", desc: true, limit: 300 });
  const posts = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: SCHOLARSHIPS })).map((p) => [p.id, p]));
  const names = new Map((await orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])).map((o) => [o.id, o.name]));
  return rows.map((r) => {
    const p = posts.get(r.listing_id);
    return { id: r.id, postingId: r.listing_id, title: p?.title ?? "Listing", company: names.get(r.org_id) ?? "The organisation", status: r.status, terms: readTerms(p?.attrs), appliedAt: r.created_at, updatedAt: r.updated_at };
  });
}

/** One of the student's own applications, with what they sent and its history (never the team's own events). */
export async function myScholarshipApplication(s: Session, responseId: string): Promise<MyScholarshipApplicationDetail> {
  const r = await mine(s, responseId);
  const [p, org, history, file] = await Promise.all([listings().one({ id: r.listing_id, module: SCHOLARSHIPS }), orgs().one({ id: r.org_id }), events().find({ response_id: r.id, org_id: r.org_id }, { order: "at" }), files().one({ response_id: r.id, org_id: r.org_id })]);
  const evs = history.flatMap((e, i) => {
    const status = e.event === "submitted" ? "applied" : e.event.startsWith("status:") ? (e.event.slice(7) as ScholarshipStatus) : null;
    return status && status in STATUS_LABEL ? [{ id: String(i), status, ...(e.actor === "applicant" && e.event !== "submitted" && e.detail ? { detail: e.detail } : {}), at: e.at }] : [];
  });
  const { answers = [], ...profile } = r.profile ?? { field: "", institution: "", region: "" };
  return {
    id: r.id,
    postingId: r.listing_id,
    title: p?.title ?? "Listing",
    company: org?.name ?? "The organisation",
    status: r.status,
    terms: readTerms(p?.attrs),
    appliedAt: r.created_at,
    updatedAt: r.updated_at,
    location: p?.location ?? "",
    workMode: p?.work_mode ?? "remote",
    description: p?.description ?? "",
    sent: { name: r.name, email: r.email, profile: profile as StudentProfile, answers, statement: r.cover_note, ...(file ? { resume: file.filename } : {}) },
    events: evs.length ? evs : [{ id: "0", status: "applied", at: r.created_at }],
  };
}

// ---- organisation side: applications ---------------------------------------------------------------------------

export async function orgScholarshipApplications(s: Session, orgId: string): Promise<ScholarshipApplicationView[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: SCHOLARSHIPS }, { order: "created_at", desc: true, limit: 500 });
  const posts = new Map((await listings().find({ org_id: orgId, module: SCHOLARSHIPS })).map((p) => [p.id, p.title]));
  const withFile = new Set((await files().findIn("response_id", rows.map((r) => r.id), { org_id: orgId })).map((f) => f.response_id));
  return rows.map((r) => {
    const { answers = [], ...profile } = r.profile ?? { field: "", institution: "", region: "" };
    return { id: r.id, postingId: r.listing_id, postingTitle: posts.get(r.listing_id) ?? "Listing", name: r.name, email: r.email, status: r.status, profile: profile as StudentProfile, answers, statement: r.cover_note, hasResume: withFile.has(r.id), appliedAt: r.created_at, updatedAt: r.updated_at };
  });
}

/** The bell and push a student gets when an organisation moves their application on. */
export function studentNotice(status: ScholarshipStatus, title: string, company: string): Notice {
  const href = "/app/m/scholarships/pipeline";
  switch (status) {
    case "shortlisted":
      return { category: "application_status", module: SCHOLARSHIPS, title: `Shortlisted by ${company}`, body: `${company} shortlisted you for ${title}.`, href, action: "Open Applications" };
    case "accepted":
      return { category: "application_status", module: SCHOLARSHIPS, title: `Selected by ${company}`, body: `${company} selected you for ${title}.`, href, action: "Open Applications" };
    case "done":
      return { category: "application_status", module: SCHOLARSHIPS, title: `${title}: completed`, body: `${company} marked ${title} completed.`, href };
    default:
      return { category: "application_status", module: SCHOLARSHIPS, title: `Update from ${company}`, body: `${company} didn't select you for ${title} this time.`, href };
  }
}

/** Someone in the workspace moves an application on; the student hears it in the app. */
export async function decideScholarship(s: Session, orgId: string, responseId: string, status: ScholarshipStatus): Promise<{ status: ScholarshipStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id: responseId, org_id: orgId, module: SCHOLARSHIPS });
  if (!r) throw new HiringError("That application isn't in this workspace.", 404);
  if (!PROVIDER_NEXT[r.status].includes(status)) throw new HiringError(`An application that's ${STATUS_LABEL[r.status].toLowerCase()} can't move to ${STATUS_LABEL[status].toLowerCase()}.`, 409);
  const n = await responses().update({ id: r.id, org_id: orgId, module: SCHOLARSHIPS, status: r.status }, { status, updated_at: now() });
  if (!n) throw new HiringError("Someone else just changed this application. Reload and try again.", 409);
  await record(r, `status:${status}`, s.tenantId);
  const [p, o] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: SCHOLARSHIPS }), orgs().one({ id: orgId })]);
  try {
    await deliver(r.responder_tenant, studentNotice(status, p?.title ?? `the ${noun(p)}`, o?.name ?? "The organisation"));
  } catch {
    // The decision stands; a bell or push that couldn't go is not worth failing it for.
  }
  return { status };
}

export async function scholarshipResume(s: Session, orgId: string, responseId: string): Promise<{ filename: string; mime: string; bytes: Buffer }> {
  await requirePermission(s, orgId, "applications.view");
  const f = await readResume(orgId, SCHOLARSHIPS, responseId);
  if (!f) throw new HiringError("This application has no résumé file.", 404);
  return f;
}

async function notifyTeam(r: ResponseRow<ScholarshipStatus, Sent>, title: string): Promise<void> {
  const p = r.profile;
  await emailTeam(r, {
    tag: "scholarships",
    subject: `New application for ${title}: ${r.name}`,
    heading: `New application: ${r.name}`,
    intro: `${r.name} applied for ${title} on WonderWorks Scholarships & Projects.`,
    rows: [
      ["Level", p.level ? LEVEL_LABEL[p.level] : ""],
      ["Studies", `${p.field} at ${p.institution}`],
      ["Email", r.email],
    ],
    href: `/app/m/scholarships/company?org=${encodeURIComponent(r.org_id)}`,
  });
}
