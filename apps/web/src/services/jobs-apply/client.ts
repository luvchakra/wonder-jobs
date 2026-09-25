"use client";
/**
 * JobsApply in the browser: builds the Application Pack snapshot from what the candidate actually
 * prepared, talks to `/api/jobs-apply/*`, pairs the browser helper with a session, and exports the
 * pack for guided or manual completion (§102–§103).
 */
import type { Application, ArtifactType } from "@/domain/applications/types";
import type { CareerDNA } from "@/domain/career/types";
import { buildApplicationProfile, PROFILE_LABEL } from "@/domain/jobs-apply/profile";
import type { ApplyProgress } from "@/domain/jobs-apply/mapper";
import type { FillDecision } from "@/domain/jobs-apply/policy";
import type { ApplicationPackSnapshot, ApplyMode, JobsApplySession, PackAnswer, RememberedAnswer } from "@/domain/jobs-apply/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { SavedResume } from "@/domain/resume/saved";
import { buildDocxBytes, DOCX_MIME } from "@/lib/docx";
import { hashKey } from "@/lib/ids";
import { markdownToPlainText } from "@/lib/richtext";
import { writeZip } from "@/lib/zip";

export type PublicSession = Omit<JobsApplySession, "tokenNonce">;
export interface SessionView {
  session: PublicSession;
  progress: ApplyProgress;
  decisions?: { fill: FillDecision; handoff: FillDecision };
  resumed?: boolean;
}
export interface ApiError {
  code: string;
  message: string;
  duplicate?: { applicationId: string; appliedAt?: string; reason: string };
}

export class JobsApplyApiError extends Error {
  constructor(
    public status: number,
    public detail: ApiError,
  ) {
    super(detail.message);
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: init?.method ?? "GET", headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  } catch {
    throw new JobsApplyApiError(0, { code: "NETWORK_ERROR", message: "Wonder couldn't reach the server. Your progress is saved — try again in a moment." });
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: ApiError | string };
  if (!res.ok) {
    const e = typeof data.error === "string" ? { code: "ERROR", message: data.error } : (data.error ?? { code: "ERROR", message: `Request failed (${res.status})` });
    throw new JobsApplyApiError(res.status, e);
  }
  return data;
}

export const jobsApplyApi = {
  list: () => call<{ sessions: (PublicSession & { progress: ApplyProgress })[] }>("/api/jobs-apply/sessions"),
  get: (id: string) => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}`),
  create: (body: { job: Pick<CanonicalJob, "id" | "title" | "company" | "applyUrl" | "companyDomain" | "onEmployerSite" | "lake">; pack: ApplicationPackSnapshot; mode: ApplyMode; startOver?: boolean; acknowledgeDuplicate?: boolean }) => call<SessionView>("/api/jobs-apply/sessions", { method: "POST", body }),
  act: (id: string, action: "start" | "stop" | "resume" | "cancel" | "tracked" | "token", body: Record<string, unknown> = {}) => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}/${action}`, { method: "POST", body }),
  setMode: (id: string, mode: ApplyMode) => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}/mode`, { method: "POST", body: { mode } }),
  approveDomain: (id: string, host: string) => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}/approve-domain`, { method: "POST", body: { host } }),
  confirm: (id: string, answer: "yes" | "not_yet" | "unsure") => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { answer } }),
  resolve: (id: string, itemId: string, body: { action: "approve" | "edit"; value: string; origin?: "ai" | "ai_edited" } | { action: "choose" | "skip" | "answered_on_portal" }) => call<SessionView>(`/api/jobs-apply/sessions/${encodeURIComponent(id)}/interventions/${encodeURIComponent(itemId)}`, { method: "POST", body }),
};

/* ------------------------------------------------------------ pack */

function current(app: Application, type: ArtifactType) {
  const a = app.artifacts.find((x) => x.type === type);
  return a?.versions.find((v) => v.id === a.currentVersionId) ?? a?.versions[a.versions.length - 1];
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "") || "Candidate";

/** "Q: …\nA: …" blocks from the screening-answers artifact, each keeping the artifact's provenance. */
export function parseAnswers(markdown: string, provenance: PackAnswer["provenance"]): PackAnswer[] {
  const out: PackAnswer[] = [];
  const re = /^\s*\*{0,2}Q:\*{0,2}\s*(.+?)\s*\n+\s*\*{0,2}A:\*{0,2}\s*([\s\S]*?)(?=\n\s*\*{0,2}Q:|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const answer = markdownToPlainText(m[2]).trim();
    if (m[1].trim() && answer) out.push({ id: `a${out.length + 1}`, question: m[1].trim(), answer, provenance });
  }
  return out.slice(0, 40);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type ResumeChoice = { kind: "tailored" } | { kind: "saved"; saved: SavedResume };

/**
 * The snapshot a session starts with (§6, §107). Only what exists goes in: the application's current
 * résumé/cover letter versions, or a saved template résumé rendered to PDF here in the browser.
 */
export async function buildPack(input: { app: Application; job: CanonicalJob; dna: CareerDNA; accountEmail?: string; memory: RememberedAnswer[]; resume: ResumeChoice; includeCover: boolean }): Promise<ApplicationPackSnapshot> {
  const { app, job, dna } = input;
  const name = safe(dna.name);
  const company = safe(job.company);
  let resume: ApplicationPackSnapshot["resume"];
  if (input.resume.kind === "saved") {
    const { renderSaved } = await import("@/services/resume/generate");
    const { renderResumePdf, fetchFont } = await import("@/services/resume/pdf");
    const { resumeFilename } = await import("@/services/resume/download");
    const g = renderSaved(input.resume.saved.document, input.resume.saved.templateId);
    if (g) {
      const bytes = await renderResumePdf(g.layout, { loadFont: fetchFont, title: `${g.document.header.name} — Résumé`, author: g.document.header.name });
      resume = { kind: "resume", filename: resumeFilename(g, "pdf"), source: "template-pdf", base64: toBase64(bytes), templateId: g.template.id, templateVersion: input.resume.saved.templateVersion, versionId: input.resume.saved.id, provenance: "SYSTEM_DERIVED" };
    }
  } else {
    const v = current(app, "resume");
    if (v) resume = { kind: "resume", filename: `${name}_Resume_${company}.docx`, source: "tailored-docx", markdown: v.content, versionId: v.id, provenance: v.provenance };
  }
  const cv = input.includeCover ? current(app, "cover_letter") : undefined;
  const coverLetter = cv ? { kind: "cover_letter" as const, filename: `${name}_Cover_Letter_${company}.docx`, source: "tailored-docx" as const, markdown: cv.content, text: markdownToPlainText(cv.content), versionId: cv.id, provenance: cv.provenance } : undefined;
  const av = current(app, "answers");
  const answers = av ? parseAnswers(av.content, av.provenance) : [];
  const profile = buildApplicationProfile(dna, { accountEmail: input.accountEmail });
  const fingerprint = JSON.stringify({ p: profile, r: resume?.versionId, c: coverLetter?.versionId, a: av?.id, m: input.memory });
  return { applicationId: app.id, jobId: job.id, jobTitle: job.title, company: job.company, profile, memory: input.memory, resume, coverLetter, answers, version: `pv_${hashKey(fingerprint)}`, capturedAt: new Date().toISOString() };
}

/* ---------------------------------------------------------- helper */

/**
 * Pair the browser helper with a session: the helper's bridge on this page fetches a session token
 * with the normal cookie (never through the URL, never visible to the employer's page) and replies.
 */
export function pairHelper(sessionId: string, timeoutMs = 4000): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    let done = false;
    const onReply = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string; ok: boolean; reason?: string }>).detail;
      if (!d || d.sessionId !== sessionId || done) return;
      done = true;
      window.removeEventListener("wonderjobs:jobsapply-paired", onReply);
      resolve({ ok: d.ok, reason: d.reason });
    };
    window.addEventListener("wonderjobs:jobsapply-paired", onReply);
    window.dispatchEvent(new CustomEvent("wonderjobs:jobsapply-pair", { detail: { sessionId } }));
    setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("wonderjobs:jobsapply-paired", onReply);
      resolve({ ok: false, reason: "The browser helper didn't answer." });
    }, timeoutMs);
  });
}

/** Opens (or re-focuses) the employer's page in one named tab per session, so "Submit on the employer site" returns to it. */
export function openDestination(sessionId: string, url: string) {
  window.open(url, `wj-apply-${sessionId}`, "noopener=no");
}

/* ---------------------------------------------------------- export */

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function packFileBytes(f: NonNullable<ApplicationPackSnapshot["resume"]>): { bytes: Uint8Array<ArrayBuffer>; mime: string } | null {
  if (f.source === "template-pdf" && f.base64) return { bytes: b64ToBytes(f.base64), mime: "application/pdf" };
  if (f.markdown) return { bytes: buildDocxBytes(f.markdown), mime: DOCX_MIME };
  return null;
}

/** Everything in one zip (§103): résumé, cover letter, answers and a plain-text summary with the application link. */
export function exportPackZip(pack: ApplicationPackSnapshot, applyUrl: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const entries: { name: string; data: Uint8Array }[] = [];
  if (pack.resume) {
    const f = packFileBytes(pack.resume);
    if (f) entries.push({ name: pack.resume.filename, data: f.bytes });
  }
  if (pack.coverLetter?.markdown) entries.push({ name: pack.coverLetter.filename, data: buildDocxBytes(pack.coverLetter.markdown) });
  if (pack.answers.length) entries.push({ name: "Application Answers.txt", data: enc.encode(pack.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}\n(${a.provenance === "AI_GENERATED" ? "AI-generated draft — review before using" : a.provenance === "USER_MODIFIED" ? "AI draft edited by you" : "Written by you"})`).join("\n\n")) });
  const profileLines = (Object.keys(pack.profile) as (keyof typeof pack.profile)[]).map((k) => `${PROFILE_LABEL[k]}: ${pack.profile[k]!.value}`);
  const summary = [
    `Application Summary`,
    ``,
    `Job: ${pack.jobTitle}`,
    `Company: ${pack.company}`,
    `Application URL: ${applyUrl}`,
    `Résumé: ${pack.resume?.filename ?? "none selected"}`,
    `Cover letter: ${pack.coverLetter?.filename ?? "not included"}`,
    `Prepared answers: ${pack.answers.length}`,
    ``,
    `Your details (from your Career Profile)`,
    ...profileLines,
    ``,
    `Checklist`,
    `[ ] Sign in on the employer's site if asked (WonderJobs never needs your portal password)`,
    `[ ] Attach your résumé${pack.coverLetter ? " and cover letter" : ""}`,
    `[ ] Answer work authorization, sponsorship, salary and any legal or demographic questions yourself`,
    `[ ] Review everything, then submit on the employer's site`,
    `[ ] Mark the application as submitted in WonderJobs`,
    ``,
    `Pack version ${pack.version}, prepared ${new Date(pack.capturedAt).toLocaleString()}.`,
  ].join("\n");
  entries.push({ name: "Application Summary.txt", data: enc.encode(summary) });
  return writeZip(entries);
}

/**
 * The web copy of a session has no file bytes (they stay server-side for the helper). For guided
 * downloads and the pack export, rebuild the exact same files from the versions the session recorded.
 */
export async function rehydratePack(pack: ApplicationPackSnapshot, app: Application | undefined, saved: SavedResume[]): Promise<ApplicationPackSnapshot> {
  let resume = pack.resume;
  if (resume?.source === "template-pdf" && !resume.base64) {
    const s = saved.find((x) => x.id === resume!.versionId);
    if (s) {
      const { renderSaved } = await import("@/services/resume/generate");
      const { renderResumePdf, fetchFont } = await import("@/services/resume/pdf");
      const g = renderSaved(s.document, s.templateId);
      if (g) resume = { ...resume, base64: toBase64(await renderResumePdf(g.layout, { loadFont: fetchFont, title: `${g.document.header.name} — Résumé`, author: g.document.header.name })) };
    }
  }
  const byVersion = (type: ArtifactType, id: string) => app?.artifacts.find((a) => a.type === type)?.versions.find((v) => v.id === id)?.content;
  if (resume?.source === "tailored-docx" && !resume.markdown) resume = { ...resume, markdown: byVersion("resume", resume.versionId) };
  let coverLetter = pack.coverLetter;
  if (coverLetter && !coverLetter.markdown) {
    const md = byVersion("cover_letter", coverLetter.versionId);
    coverLetter = { ...coverLetter, markdown: md, text: md ? markdownToPlainText(md) : undefined };
  }
  return { ...pack, resume, coverLetter };
}
