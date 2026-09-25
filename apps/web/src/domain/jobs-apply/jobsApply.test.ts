import { describe, expect, it } from "vitest";
import { defaultPolicy, resolveCapability, type AutomationPolicy } from "@/domain/automation/policy";
import type { CareerDNA } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import type { Application } from "@/domain/applications/types";
import { classifyField } from "./classify";
import { checkDomain, destinationFor, detectProvider, registrableDomain } from "./destination";
import { mapForm, matchPackAnswer, progressOf } from "./mapper";
import { fillDecision, fillGate, handoffDecision } from "./policy";
import { buildApplicationProfile, freshMemory, missingProfileFields, splitName } from "./profile";
import { applyReadiness, findDuplicate } from "./readiness";
import * as S from "./session";
import { canTransition, stepOf } from "./states";
import type { ApplicationField, ApplicationForm, ApplicationPackSnapshot, JobsApplySession } from "./types";

const NOW = "2026-09-25T10:00:00.000Z";
const T = Date.parse(NOW);

const dna: CareerDNA = {
  ...EMPTY_DNA,
  name: "Priya Raman Iyer",
  headline: "Senior Director, Identity Security",
  history: {
    contact: { email: "priya@example.com", phone: "+91 98765 43210", location: "Bengaluru, Karnataka, India", linkedinUrl: "https://www.linkedin.com/in/priya", portfolioUrl: "https://github.com/priya" },
    experience: [
      { id: "e1", employer: "Northwind", title: "Director, IAM", startDate: "2021-01", current: true, bullets: [], provenance: "RESUME_IMPORTED" },
      { id: "e2", employer: "Contoso", title: "Manager", startDate: "2016-01", endDate: "2020-12", bullets: [], provenance: "USER_PROVIDED" },
    ],
    education: [],
    certifications: [],
    projects: [],
    publications: [],
    researchInterests: [],
  },
  updatedAt: NOW,
};

function pack(over: Partial<ApplicationPackSnapshot> = {}): ApplicationPackSnapshot {
  return {
    applicationId: "app_1",
    jobId: "job_1",
    jobTitle: "Senior Director — Identity",
    company: "Example",
    profile: buildApplicationProfile(dna),
    memory: [],
    resume: { kind: "resume", filename: "Priya_Resume.pdf", source: "template-pdf", base64: "JVBERi0=", templateId: "executive-v1", templateVersion: "1.0.0", versionId: "sv_1", provenance: "SYSTEM_DERIVED" },
    coverLetter: { kind: "cover_letter", filename: "Cover-Letter.docx", source: "tailored-docx", markdown: "Dear team", text: "Dear team, …", versionId: "ver_2", provenance: "USER_MODIFIED" },
    answers: [{ id: "a1", question: "Why do you want to join Example?", answer: "Because of the identity platform work.", provenance: "USER_MODIFIED" }],
    version: "pv_abc",
    capturedAt: NOW,
    ...over,
  };
}

let n = 0;
const f = (label: string, over: Partial<ApplicationField> = {}): ApplicationField => ({ id: over.id ?? `f${++n}`, label, type: "text", required: true, ...over });

describe("classify — field mapping (APPLY-011…020)", () => {
  const cls = (field: ApplicationField) => classifyField(field, { hasCoverLetter: true });
  it("APPLY-011/012/013/014 names, email and phone map with HIGH confidence", () => {
    expect(cls(f("First Name"))).toMatchObject({ classification: "safe", confidence: "HIGH", target: { kind: "profile", key: "firstName" } });
    expect(cls(f("Given name"))).toMatchObject({ target: { key: "firstName" } });
    expect(cls(f("Last name"))).toMatchObject({ target: { key: "lastName" }, confidence: "HIGH" });
    expect(cls(f("Surname"))).toMatchObject({ target: { key: "lastName" } });
    expect(cls(f("Email address", { type: "email" }))).toMatchObject({ target: { key: "email" }, confidence: "HIGH" });
    expect(cls(f("Mobile number"))).toMatchObject({ target: { key: "phone" }, confidence: "HIGH" });
    expect(cls(f("", { hints: { autocomplete: "given-name" } }))).toMatchObject({ target: { key: "firstName" }, confidence: "HIGH" });
  });
  it("APPLY-015/016/017 LinkedIn, portfolio and location", () => {
    expect(cls(f("LinkedIn Profile"))).toMatchObject({ target: { key: "linkedinUrl" }, classification: "safe" });
    expect(cls(f("Portfolio URL"))).toMatchObject({ target: { key: "portfolioUrl" } });
    expect(cls(f("GitHub"))).toMatchObject({ target: { key: "githubUrl" } });
    expect(cls(f("Current location"))).toMatchObject({ target: { key: "location" }, category: "LOCATION" });
    expect(cls(f("City"))).toMatchObject({ target: { key: "city" } });
  });
  it("APPLY-018 ambiguous or volatile fields need confirmation, never silent fill", () => {
    expect(cls(f("Preferred first name"))).toMatchObject({ classification: "unknown", target: { kind: "none" } });
    expect(cls(f("Expected salary"))).toMatchObject({ classification: "confirm", target: { kind: "memory", key: "salaryExpectation" } });
    expect(cls(f("Notice period"))).toMatchObject({ classification: "confirm", target: { key: "noticePeriod" } });
    expect(cls(f("Are you willing to relocate?"))).toMatchObject({ classification: "confirm", category: "RELOCATION" });
    expect(cls(f("Current CTC"))).toMatchObject({ classification: "confirm", target: { kind: "none" } });
    // Matched only by a technical name: MEDIUM, so it's offered for confirmation rather than filled.
    expect(cls(f("", { hints: { name: "applicant_phone" } }))).toMatchObject({ target: { key: "phone" }, confidence: "MEDIUM" });
  });
  it("APPLY-019 / APPLY-040 / APPLY-052 sensitive questions are human-only, whatever else they mention", () => {
    for (const label of [
      "Are you legally authorized to work in the United States?",
      "Will you now or in the future require sponsorship for employment visa status?",
      "Name of your visa sponsor",
      "Gender",
      "Veteran status",
      "Do you have a disability?",
      "Race / Ethnicity",
      "Have you ever been convicted of a felony?",
      "Social Security Number",
      "Date of birth",
      "I certify that the information provided is true",
    ]) {
      const c = cls(f(label));
      expect(c.classification, label).toBe("human-only");
      expect(c.target.kind, label).toBe("none");
    }
    expect(cls(f("I agree to the privacy notice", { type: "checkbox" })).classification).toBe("human-only");
  });
  it("credentials, one-time codes and payment fields are never touched", () => {
    expect(cls(f("Password", { type: "password" }))).toMatchObject({ category: "CREDENTIAL", classification: "human-only" });
    expect(cls(f("Verification code"))).toMatchObject({ category: "CREDENTIAL" });
    expect(cls(f("", { hints: { autocomplete: "one-time-code" } }))).toMatchObject({ category: "CREDENTIAL" });
    expect(cls(f("Card number"))).toMatchObject({ category: "CREDENTIAL", classification: "human-only" });
    expect(cls(f("", { hints: { autocomplete: "cc-number" } })).classification).toBe("human-only");
  });
  it("APPLY-020 an unknown question is left for the candidate", () => {
    expect(cls(f("How did you hear about us?"))).toMatchObject({ classification: "unknown", confidence: "UNKNOWN" });
  });
  it("open questions are drafts; a quantify question asks for the metric (APPLY-039)", () => {
    expect(cls(f("Why do you want to work for Example?", { type: "textarea" })).target.kind).toBe("draft");
    expect(cls(f("Describe an achievement and quantify its impact", { type: "textarea" })).target.kind).toBe("metric");
  });
  it("documents: résumé and cover letter files", () => {
    expect(cls(f("Resume/CV", { type: "file" }))).toMatchObject({ target: { kind: "file", file: "resume" }, confidence: "HIGH" });
    expect(cls(f("Cover Letter", { type: "file" }))).toMatchObject({ target: { kind: "file", file: "cover_letter" } });
    expect(classifyField(f("Cover Letter", { type: "file" }), { hasCoverLetter: false }).classification).toBe("unknown");
    expect(cls(f("Transcript", { type: "file" })).classification).toBe("unknown");
  });
});

describe("profile", () => {
  it("builds only from the candidate's own data, with provenance", () => {
    const p = buildApplicationProfile(dna, { accountEmail: "login@example.com" });
    expect(p.firstName).toMatchObject({ value: "Priya", provenance: "USER_PROVIDED" });
    expect(p.lastName?.value).toBe("Raman Iyer");
    expect(p.email).toMatchObject({ value: "priya@example.com", provenance: "USER_PROVIDED" });
    expect(p.city?.value).toBe("Bengaluru");
    expect(p.country?.value).toBe("India");
    expect(p.githubUrl?.value).toBe("https://github.com/priya");
    expect(p.currentEmployer).toMatchObject({ value: "Northwind", provenance: "RESUME_IMPORTED" });
  });
  it("falls back to the verified sign-in email, and never invents a surname or contact detail", () => {
    const p = buildApplicationProfile({ ...EMPTY_DNA, name: "Madonna", updatedAt: NOW }, { accountEmail: "m@example.com" });
    expect(p.email).toMatchObject({ provenance: "VERIFIED" });
    expect(p.lastName).toBeUndefined();
    expect(p.phone).toBeUndefined();
    expect(missingProfileFields(p)).toEqual(["Phone number", "LinkedIn profile", "Location"]);
    expect(splitName("  ")).toEqual({ firstName: "", lastName: "" });
  });
  it("remembered answers go stale after 30 days (§85)", () => {
    const mem = [{ key: "noticePeriod" as const, value: "60 days", confirmedAt: "2026-09-12T00:00:00Z", source: "USER_PROVIDED" as const }];
    expect(freshMemory(mem, "noticePeriod", T)?.value).toBe("60 days");
    expect(freshMemory(mem, "noticePeriod", Date.parse("2026-11-01T00:00:00Z"))).toBeUndefined();
  });
});

describe("mapper", () => {
  const form = (fields: ApplicationField[]) => ({ fields });
  it("fills SAFE+HIGH fields with the candidate's own values; everything else goes to Needs you", () => {
    const { mappings, interventions } = mapForm(form([f("First name", { id: "fn" }), f("Work authorization status", { id: "wa" }), f("Expected salary", { id: "sal" }), f("Resume", { id: "cv", type: "file" })]), pack(), {}, T);
    expect(mappings.find((m) => m.fieldId === "fn")).toMatchObject({ value: "Priya", status: "pending", source: "career-profile" });
    expect(mappings.find((m) => m.fieldId === "cv")).toMatchObject({ file: "resume", status: "pending" });
    expect(mappings.find((m) => m.fieldId === "wa")?.value).toBeUndefined();
    expect(interventions.map((i) => [i.fieldId, i.kind])).toEqual([
      ["wa", "answer_on_portal"],
      ["sal", "confirm_value"],
    ]);
  });
  it("a human-only field never carries a value — not even one the candidate 'approved'", () => {
    const { mappings } = mapForm(form([f("Are you authorized to work in India?", { id: "wa" })]), pack(), { wa: { value: "Yes", provenance: "USER_PROVIDED", at: NOW } }, T);
    expect(mappings[0].value).toBeUndefined();
    expect(mappings[0].classification).toBe("human-only");
  });
  it("§30 several résumé fields → the candidate chooses; then only that one is used", () => {
    const fields = [f("Resume", { id: "r1", type: "file" }), f("CV", { id: "r2", type: "file" })];
    const first = mapForm(form(fields), pack(), {}, T);
    expect(first.interventions.map((i) => i.kind)).toEqual(["choose_file_field", "choose_file_field"]);
    const chosen = mapForm(form(fields), pack(), { r2: { value: "resume", provenance: "USER_PROVIDED", at: NOW } }, T);
    expect(chosen.mappings.find((m) => m.fieldId === "r2")).toMatchObject({ file: "resume", status: "pending" });
    expect(chosen.mappings.find((m) => m.fieldId === "r1")?.status).toBe("skipped");
  });
  it("never overwrites what the candidate already typed on the page", () => {
    const { mappings } = mapForm(form([f("Email", { id: "e", type: "email", hasValue: true })]), pack(), {}, T);
    expect(mappings[0]).toMatchObject({ status: "skipped" });
    expect(mappings[0].value).toBeUndefined();
  });
  it("a required field the profile can't answer is surfaced, an optional one is left empty", () => {
    const p = pack({ profile: buildApplicationProfile({ ...EMPTY_DNA, name: "A B", updatedAt: NOW }) });
    const { mappings, interventions } = mapForm(form([f("Phone", { id: "ph" }), f("LinkedIn", { id: "li", required: false })]), p, {}, T);
    expect(interventions.map((i) => i.fieldId)).toEqual(["ph"]);
    expect(mappings.find((m) => m.fieldId === "li")?.status).toBe("skipped");
  });
  it("selects fill only with an exactly matching option", () => {
    const opts = [
      { label: "India", value: "IN" },
      { label: "United States", value: "US" },
    ];
    const ok = mapForm(form([f("Country", { id: "c", type: "select", options: opts })]), pack(), {}, T);
    expect(ok.mappings[0]).toMatchObject({ value: "IN" });
    const none = mapForm(form([f("Country", { id: "c", type: "select", options: [{ label: "Germany", value: "DE" }] })]), pack(), {}, T);
    expect(none.mappings[0].value).toBeUndefined();
    expect(none.interventions[0].kind).toBe("confirm_value");
  });
  it("offers a prepared answer or a fresh remembered one, never fills either on its own", () => {
    const p = pack({ memory: [{ key: "noticePeriod", value: "60 days", confirmedAt: "2026-09-20T00:00:00Z", source: "USER_PROVIDED" }] });
    const { mappings, interventions } = mapForm(form([f("Why do you want to join Example?", { id: "why", type: "textarea" }), f("Notice period", { id: "np" })]), p, {}, T);
    expect(mappings.every((m) => m.value === undefined)).toBe(true);
    expect(interventions.find((i) => i.fieldId === "why")?.suggestion?.value).toMatch(/identity platform/);
    expect(interventions.find((i) => i.fieldId === "np")?.suggestion).toMatchObject({ value: "60 days", lastConfirmedAt: "2026-09-20T00:00:00Z" });
    expect(matchPackAnswer("What is your favourite colour?", pack().answers)).toBeUndefined();
  });
  it("an approved answer fills as confirmed", () => {
    const { mappings } = mapForm(form([f("Notice period", { id: "np" })]), pack(), { np: { value: "30 days", provenance: "USER_PROVIDED", at: NOW } }, T);
    expect(mappings[0]).toMatchObject({ status: "confirmed", value: "30 days", source: "user-entered" });
  });
});

describe("destination (APPLY-008/010, SEC-010/011)", () => {
  it("detects every registered ATS from the URL", () => {
    expect(detectProvider("https://boards.greenhouse.io/acme/jobs/1")).toBe("greenhouse");
    expect(detectProvider("https://jobs.lever.co/acme/abc")).toBe("lever");
    expect(detectProvider("https://jobs.ashbyhq.com/acme/1")).toBe("ashby");
    expect(detectProvider("https://acme.wd5.myworkdayjobs.com/en-US/careers/job/1")).toBe("workday");
    expect(detectProvider("https://jobs.smartrecruiters.com/Acme/1")).toBe("smartrecruiters");
    expect(detectProvider("https://apply.workable.com/acme/j/1")).toBe("workable");
    expect(detectProvider("https://acme.teamtailor.com/jobs/1")).toBe("teamtailor");
    expect(detectProvider("https://acme.recruitee.com/o/role")).toBe("recruitee");
    expect(detectProvider("https://acme.jobs.personio.de/job/1")).toBe("personio");
    expect(detectProvider("https://greenhouse.io.evil.com/x")).toBeUndefined();
    expect(detectProvider("javascript:alert(1)")).toBeUndefined();
  });
  it("registrable domains keep two-label suffixes", () => {
    expect(registrableDomain("careers.acme.co.uk")).toBe("acme.co.uk");
    expect(registrableDomain("jobs.acme.com")).toBe("acme.com");
  });
  it("classifies a move as expected, related, SSO, approved or unexpected (§72)", () => {
    const d = destinationFor({ applyUrl: "https://boards.greenhouse.io/acme/jobs/1", companyDomain: "acme.com", onEmployerSite: false })!;
    expect(d).toMatchObject({ provider: "greenhouse", type: "ats", applicationMethod: "browser" });
    expect(checkDomain("boards.greenhouse.io", d)).toBe("expected");
    expect(checkDomain("job-boards.greenhouse.io", d)).toBe("related");
    expect(checkDomain("careers.acme.com", d)).toBe("related");
    expect(checkDomain("accounts.google.com", d)).toBe("sso");
    expect(checkDomain("acme-careers-login.xyz", d)).toBe("unexpected");
    expect(checkDomain("acme-careers-login.xyz", d, ["acme-careers-login.xyz"])).toBe("approved");
    expect(destinationFor({ applyUrl: "https://www.linkedin.com/jobs/view/1", onEmployerSite: false })?.type).toBe("aggregator");
    expect(destinationFor({ applyUrl: "ftp://x", onEmployerSite: false })).toBeNull();
  });
});

describe("governance: fill_application through resolveCapability (CLAUDE.md)", () => {
  const withFill = (mode: "automatic" | "ask" | "off"): AutomationPolicy => ({ ...defaultPolicy(), fill_application: mode });
  it("is a medium-risk, non-external capability that defaults to ask", () => {
    expect(defaultPolicy().fill_application).toBe("ask");
    expect(resolveCapability("fill_application", defaultPolicy(), "autonomous")).toBe("ask");
  });
  it("policy off → skip at every level (guided mode only)", () => {
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(fillDecision(withFill("off"), level)).toBe("skip");
  });
  it("policy ask → ask at every level", () => {
    for (const level of ["assist", "guided", "autonomous", "continuous"] as const) expect(fillDecision(withFill("ask"), level)).toBe("ask");
  });
  it("policy automatic → run, except at the 'Help me' level where it still asks", () => {
    expect(fillDecision(withFill("automatic"), "assist")).toBe("ask");
    expect(fillDecision(withFill("automatic"), "guided")).toBe("run");
  });
  it("a failed or missing lookup fails closed to ask — never automatic", () => {
    expect(fillDecision(undefined, "autonomous")).toBe("ask");
    expect(fillDecision(withFill("automatic"), undefined)).toBe("ask");
    const { fill_application: _drop, ...older } = withFill("automatic");
    void _drop;
    expect(fillDecision(older, "autonomous")).toBe("ask");
    expect(handoffDecision(undefined, "autonomous")).toBe("ask");
    expect(handoffDecision({ ...defaultPolicy(), submit_application: "off" }, "autonomous")).toBe("skip");
  });
});

/* ---------------------------------------------------------------- session */

const dest = destinationFor({ applyUrl: "https://boards.greenhouse.io/example/jobs/7", companyDomain: "example.com", onEmployerSite: false })!;
function fresh(p = pack()): JobsApplySession {
  return S.start(S.createSession({ id: "jas_1", tenantId: "tenant-a", nonce: "n0", destination: dest, pack: p, mode: "assisted", now: NOW }), NOW, "n1");
}
const greenhouseForm = (over: Partial<ApplicationForm> = {}): ApplicationForm => ({
  url: "https://boards.greenhouse.io/example/jobs/7?gh_src=abc",
  provider: "greenhouse",
  adapter: "adapter:greenhouse",
  step: 1,
  signals: [],
  fields: [
    { id: "first_name", label: "First Name", type: "text", required: true },
    { id: "last_name", label: "Last Name", type: "text", required: true },
    { id: "email", label: "Email", type: "email", required: true },
    { id: "phone", label: "Phone", type: "phone", required: false },
    { id: "resume", label: "Resume/CV", type: "file", required: true },
    { id: "wa", label: "Are you legally authorized to work in India?", type: "select", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] },
    { id: "why", label: "Why do you want to join Example?", type: "textarea", required: false },
  ],
  ...over,
});

describe("session state machine", () => {
  it("SUBMITTED is only reachable by the candidate, and only after the application was opened (APPLY-053)", () => {
    expect(canTransition("READY_TO_REVIEW", "SUBMITTED", "helper").ok).toBe(false);
    expect(canTransition("READY_TO_REVIEW", "SUBMITTED", "wonder").ok).toBe(false);
    expect(canTransition("VERIFICATION", "SUBMITTED", "candidate").ok).toBe(true);
    expect(canTransition("READY", "SUBMITTED", "candidate").ok).toBe(false);
    expect(canTransition("FILLING", "TRACKED", "wonder").ok).toBe(false);
    expect(canTransition("TRACKED", "FILLING", "candidate").ok).toBe(false);
    expect(canTransition("CANCELLED", "OPENING", "candidate").ok).toBe(false);
    expect(canTransition("FILLING", "READY", "candidate").ok).toBe(false);
    expect(stepOf("WAITING_FOR_USER")).toBe("fill");
  });

  it("golden path: start → form → fill → needs you → review → evidence → candidate confirms → tracked", () => {
    let s = fresh();
    expect(s.status).toBe("OPENING");
    expect(s.idempotencyKey).toBe("jobsapply:job_1:pv_abc");
    s = S.recordInspection(s, greenhouseForm(), NOW);
    expect(s.status).toBe("FORM_DETECTED");
    const p = progressOf(s);
    expect(p.fillable).toBe(5);
    expect(s.interventions.map((i) => i.kind)).toEqual(["answer_on_portal", "draft_answer"]);
    const gate = fillGate(s, { host: "boards.greenhouse.io", decision: "ask", candidateClicked: true });
    expect(gate.ok && gate.mappings.map((m) => m.fieldId).sort()).toEqual(["email", "first_name", "last_name", "phone", "resume"]);
    s = S.recordFillResults(s, gate.ok ? gate.mappings.map((m) => ({ fieldId: m.fieldId, ok: true })) : [], NOW);
    expect(s.status).toBe("WAITING_FOR_USER");
    // Work authorization: the candidate answers on the employer's form; the helper reports only that it has a value.
    s = S.recordInspection(s, greenhouseForm({ fields: greenhouseForm().fields.map((x) => (x.id === "wa" ? { ...x, hasValue: true } : x.id !== "why" ? { ...x, hasValue: x.type !== "file" } : x)) }), NOW);
    expect(s.interventions.find((i) => i.fieldId === "wa")).toMatchObject({ status: "resolved", resolution: "answered_on_portal" });
    s = S.resolveIntervention(s, "iv_why", { action: "approve", value: "Because of the identity platform work." }, NOW);
    expect(s.approvedAnswers.why.provenance).toBe("USER_MODIFIED");
    expect(s.status).toBe("FILLING");
    s = S.recordFillResults(s, [{ fieldId: "why", ok: true }], NOW);
    expect(s.status).toBe("READY_TO_REVIEW");
    s = S.recordSubmitClicked(s, NOW);
    expect(s.status).toBe("SUBMITTING");
    s = S.recordSubmissionDetected(s, { url: "https://boards.greenhouse.io/example/jobs/7/confirmation?x=1", excerpt: "Thank you for applying. Your application has been received." }, NOW);
    expect(s.status).toBe("VERIFICATION");
    expect(s.evidence[0]).toMatchObject({ kind: "confirmation_page", confidence: "LIKELY", url: "boards.greenhouse.io/example/jobs/7/confirmation" });
    s = S.confirmSubmission(s, "yes", NOW);
    expect(s.status).toBe("SUBMITTED");
    expect(S.confirmSubmission(s, "yes", NOW)).toBe(s); // idempotent
    s = S.markTracked(s, NOW);
    expect(s.status).toBe("TRACKED");
    expect(s.pack.resume?.base64).toBeUndefined();
    expect(() => S.recordFillResults(s, [], NOW)).toThrow(/ended/);
  });

  it("the audit trail records categories and counts, never a value (§88, SEC-006/007)", () => {
    let s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    s = S.recordFillResults(s, [{ fieldId: "first_name", ok: true }, { fieldId: "email", ok: true }], NOW);
    s = S.resolveIntervention(s, "iv_why", { action: "edit", value: "My private motivation text" }, NOW);
    const log = JSON.stringify(s.audit);
    for (const secret of ["Priya", "priya@example.com", "98765", "My private motivation", "gh_src"]) expect(log).not.toContain(secret);
  });

  it("human-only items can't be given a value through WonderJobs", () => {
    const s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    expect(() => S.resolveIntervention(s, "iv_wa", { action: "approve", value: "Yes" }, NOW)).toThrow(/never fills/);
    const ok = S.resolveIntervention(s, "iv_wa", { action: "answered_on_portal" }, NOW);
    expect(ok.approvedAnswers.wa).toBeUndefined();
  });

  it("APPLY-045/046 CAPTCHA and MFA pause; the candidate continues", () => {
    let s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    s = S.recordInspection(s, greenhouseForm({ signals: ["captcha"] }), NOW);
    expect(s).toMatchObject({ status: "PAUSED", failure: "CAPTCHA_REQUIRED" });
    expect(fillGate(s, { host: "boards.greenhouse.io", decision: "run", candidateClicked: false }).ok).toBe(false);
    s = S.resume(s, NOW);
    expect(s.status).toBe("FORM_DETECTED");
    s = S.recordInspection(s, greenhouseForm({ signals: ["otp"] }), NOW);
    expect(s.failure).toBe("MFA_REQUIRED");
  });

  it("login pages ask the candidate to sign in on the employer's site (§35)", () => {
    const s = S.recordInspection(fresh(), { url: "https://boards.greenhouse.io/login", adapter: "generic", step: 1, signals: ["login_form"], fields: [{ id: "u", label: "Email", type: "email", required: true }, { id: "p", label: "Password", type: "password", required: true }] }, NOW);
    expect(s).toMatchObject({ status: "AUTHENTICATION_REQUIRED", failure: "AUTH_REQUIRED" });
    expect(s.formFields.some((x) => x.type === "password")).toBe(false);
  });

  it("APPLY-051 a payment request blocks", () => {
    const s = S.recordInspection(fresh(), greenhouseForm({ signals: ["payment"] }), NOW);
    expect(s).toMatchObject({ status: "BLOCKED", failure: "PAYMENT_REQUESTED" });
  });

  it("APPLY-050 an unexpected domain pauses until the candidate approves or stops (Golden journey 7)", () => {
    let s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    s = S.recordNavigation(s, "https://acme-careers-login.xyz/apply", NOW, { passwordField: true });
    expect(s).toMatchObject({ status: "PAUSED", failure: "DOMAIN_CHANGED" });
    expect(fillGate(s, { host: "acme-careers-login.xyz", decision: "run", candidateClicked: true }).ok).toBe(false);
    const approved = S.approveDomain(s, "acme-careers-login.xyz", NOW);
    expect(approved.status).toBe("FORM_DETECTED");
    const stopped = S.stop(s, NOW, "n2");
    expect(stopped).toMatchObject({ stopped: true, tokenNonce: "n2", status: "PAUSED" });
    // Signing in through an identity provider is fine.
    expect(S.recordNavigation(S.recordInspection(fresh(), greenhouseForm(), NOW), "https://accounts.google.com/o/oauth2", NOW).status).toBe("FORM_DETECTED");
  });

  it("EXT-009 stop blocks further fills and revokes the helper token's nonce", () => {
    let s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    s = S.stop(s, NOW, "n9", "helper");
    expect(fillGate(s, { host: "boards.greenhouse.io", decision: "run", candidateClicked: true })).toEqual({ ok: false, reason: "You stopped this application." });
    expect(s.tokenNonce).toBe("n9");
  });

  it("fill gate (§66): ask needs the click; skip never fills; wrong host never fills; human-only never included", () => {
    const s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    expect(fillGate(s, { host: "boards.greenhouse.io", decision: "ask", candidateClicked: false }).ok).toBe(false);
    expect(fillGate(s, { host: "boards.greenhouse.io", decision: "skip", candidateClicked: true }).ok).toBe(false);
    expect(fillGate(s, { host: "evil.example.net", decision: "run", candidateClicked: true }).ok).toBe(false);
    expect(fillGate(s, { host: "accounts.google.com", decision: "run", candidateClicked: true }).ok).toBe(false);
    const tampered: JobsApplySession = { ...s, fieldMappings: s.fieldMappings.map((m) => (m.fieldId === "wa" ? { ...m, value: "1", status: "confirmed" as const } : m)) };
    const g = fillGate(tampered, { host: "boards.greenhouse.io", decision: "run", candidateClicked: false });
    expect(g.ok && g.mappings.some((m) => m.fieldId === "wa")).toBe(false);
  });

  it("APPLY-061 'I'm not sure' records UNKNOWN and never retries; 'Not yet' goes back to review", () => {
    let s = S.recordInspection(fresh(), greenhouseForm({ fields: greenhouseForm().fields.slice(0, 3) }), NOW);
    s = S.recordFillResults(s, [{ fieldId: "first_name", ok: true }, { fieldId: "last_name", ok: true }, { fieldId: "email", ok: true }], NOW);
    expect(S.confirmSubmission(s, "not_yet", NOW).status).toBe("READY_TO_REVIEW");
    const u = S.confirmSubmission(s, "unsure", NOW);
    expect(u).toMatchObject({ status: "UNKNOWN", failure: "SUBMISSION_UNKNOWN" });
    expect(u.evidence.at(-1)?.confidence).toBe("UNKNOWN");
    expect(S.confirmSubmission(u, "yes", NOW).status).toBe("SUBMITTED");
  });

  it("§70 a failed field becomes Needs you; nothing restarts", () => {
    let s = S.recordInspection(fresh(), greenhouseForm(), NOW);
    s = S.recordFillResults(s, [{ fieldId: "first_name", ok: true }, { fieldId: "resume", ok: false, error: "file_failed" }], NOW);
    expect(s.fieldMappings.find((m) => m.fieldId === "first_name")?.status).toBe("filled");
    expect(s.interventions.find((i) => i.fieldId === "resume")?.kind).toBe("unknown_field");
  });

  it("multi-step: each step's fields are kept; filled fields stay filled across a re-read (APPLY-031…034)", () => {
    let s = S.recordInspection(fresh(), greenhouseForm({ fields: greenhouseForm().fields.slice(0, 3), stepCount: 2 }), NOW);
    s = S.recordFillResults(s, [{ fieldId: "first_name", ok: true }], NOW);
    s = S.recordInspection(s, greenhouseForm({ step: 2, stepCount: 2, fields: [{ id: "cv2", label: "Resume", type: "file", required: true }] }), NOW);
    expect(s.formFields.map((x) => [x.id, x.step])).toEqual([
      ["first_name", 1],
      ["last_name", 1],
      ["email", 1],
      ["cv2", 2],
    ]);
    expect(s.fieldMappings.find((m) => m.fieldId === "first_name")?.status).toBe("filled");
  });

  it("confirming 'yes' before the application was ever opened is refused", () => {
    const s = S.createSession({ id: "x", tenantId: "t", nonce: "n", destination: dest, pack: pack(), mode: "guided", now: NOW });
    expect(() => S.confirmSubmission(s, "yes", NOW)).toThrow(/never opened/);
  });

  it("publicSession drops the helper nonce and file bytes", () => {
    const pub = S.publicSession(fresh());
    expect("tokenNonce" in pub).toBe(false);
    expect(pub.pack.resume?.base64).toBeUndefined();
  });
});

describe("readiness and duplicates (APPLY-002/006, §57, §104–§106)", () => {
  it("blocks without a résumé, name or email and says exactly what's missing", () => {
    const r = applyReadiness({ ...pack(), resume: undefined, profile: {} });
    expect(r.ok).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/Résumé.*Your name.*Email/);
    expect(applyReadiness(pack()).ok).toBe(true);
  });
  const job = { id: "job_1", applyUrl: "https://boards.greenhouse.io/example/jobs/7", company: "Example", title: "Senior Director — Identity" };
  const app = (over: Partial<Application>): Application => ({ id: "a1", jobId: "job_1", status: "submitted", createdAt: NOW, appliedAt: "2026-09-18T00:00:00Z", artifacts: [], events: [], followUps: [], submissionKey: "k", ...over });
  it("finds a submitted application for the same job, apply link, or employer + title", () => {
    expect(findDuplicate(job, [app({})], {})).toMatchObject({ reason: "same job", appliedAt: "2026-09-18T00:00:00Z" });
    expect(findDuplicate(job, [app({ jobId: "other" })], { other: { applyUrl: "https://boards.greenhouse.io/example/jobs/7/apply", company: "X", title: "Y" } })?.reason).toBe("same apply link");
    expect(findDuplicate(job, [app({ jobId: "other" })], { other: { applyUrl: "https://x.test/1", company: "example", title: "senior director identity" } })?.reason).toBe("same employer and title");
    expect(findDuplicate(job, [app({ status: "preparing" })], {})).toBeNull();
  });
});

describe("AI provenance on approved answers (CLAUDE.md: every AI artifact keeps its provenance)", () => {
  it("an AI draft approved as-is stays AI_GENERATED; edited becomes USER_MODIFIED; typed is USER_PROVIDED", () => {
    const base = S.recordInspection(fresh(), greenhouseForm(), NOW);
    expect(S.resolveIntervention(base, "iv_why", { action: "approve", value: "AI text", origin: "ai" }, NOW).approvedAnswers.why.provenance).toBe("AI_GENERATED");
    expect(S.resolveIntervention(base, "iv_why", { action: "edit", value: "AI text, edited", origin: "ai_edited" }, NOW).approvedAnswers.why.provenance).toBe("USER_MODIFIED");
    const noSuggestion: JobsApplySession = { ...base, interventions: base.interventions.map((i) => (i.id === "iv_why" ? { ...i, suggestion: undefined } : i)) };
    expect(S.resolveIntervention(noSuggestion, "iv_why", { action: "edit", value: "My own words" }, NOW).approvedAnswers.why.provenance).toBe("USER_PROVIDED");
  });
});

describe("pauses only the candidate can lift", () => {
  it("a page read never lifts a domain, payment or stop pause", () => {
    const base = S.recordInspection(fresh(), greenhouseForm(), NOW);
    const moved = S.recordNavigation(base, "https://elsewhere.example.net/x", NOW);
    expect(S.recordInspection(moved, greenhouseForm(), NOW)).toBe(moved);
    const stopped = S.stop(base, NOW, "n5");
    expect(S.recordInspection(stopped, greenhouseForm(), NOW)).toBe(stopped);
    const blocked = S.recordInspection(base, greenhouseForm({ signals: ["payment"] }), NOW);
    expect(S.recordInspection(blocked, greenhouseForm(), NOW).status).toBe("BLOCKED");
  });
  it("signing in is recorded once the form appears, even after a verification pause", () => {
    let s = S.recordInspection(fresh(), { url: "https://boards.greenhouse.io/login", adapter: "generic", step: 1, signals: ["login_form"], fields: [{ id: "p", label: "Password", type: "password", required: true }] }, NOW);
    s = S.recordInspection(s, greenhouseForm({ signals: ["captcha"] }), NOW);
    s = S.resume(s, NOW);
    s = S.recordInspection(s, greenhouseForm(), NOW);
    expect(s.audit.filter((a) => a.event === "AUTH_COMPLETED")).toHaveLength(1);
  });
});
