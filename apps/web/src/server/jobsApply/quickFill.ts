/**
 * Fill on a page WonderJobs has no application for: the same field understanding as Apply with Wonder
 * (classify → map → shape, plus the model's reading of unrecognised questions), run against the
 * candidate's Career Profile, CV history, saved answers and their latest uploaded résumé. Fills only
 * what the session path would fill without review; everything else is listed for the candidate.
 *
 * Gated by `fill_application` through resolveCapability — the candidate pressed Fill, so "ask" is met;
 * "off" refuses. Nothing is pressed, submitted or remembered, and the AI matcher sees fact names only.
 */
import type { CareerDNA } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { migratePolicy, POLICY_VERSION, resolveCapability, type AutomationLevel } from "@/domain/automation/policy";
import { mapForm } from "@/domain/jobs-apply/mapper";
import { buildApplicationProfile, educationFacts, experienceFacts } from "@/domain/jobs-apply/profile";
import type { AiHint, ApplicationField, ApplicationPackSnapshot, PackFile, RememberedAnswer } from "@/domain/jobs-apply/types";
import { readClientState, readClientStateVersioned } from "@/server/clientState";
import { resumeFileStore } from "@/server/resume/files";
import { aiMatchFields } from "./aiMatch";
import { packSensitive, withIdNumbers } from "./sensitive";

export interface QuickPlan {
  allowed: boolean;
  reason?: string;
  fills: ({ fieldId: string; label: string; value: string } | { fieldId: string; label: string; file: "resume" })[];
  needsYou: { label: string; reason: string }[];
  resume?: { filename: string; mime: string; base64: string };
}

export interface QuickDeps {
  accountEmail?: string;
  /** The model's matcher — injectable for tests; null when no model is configured. */
  match?: typeof aiMatchFields;
  now?: number;
}

export async function quickPlan(tenantId: string, form: { fields: ApplicationField[]; signals: string[] }, deps: QuickDeps = {}): Promise<QuickPlan> {
  const now = deps.now ?? Date.now();
  if (form.signals.includes("payment")) return { allowed: false, reason: "This page asks for payment details — Wonder never fills those.", fills: [], needsYou: [] };

  const [career, automation] = await Promise.all([
    readClientState<{ dna?: CareerDNA; answerMemory?: RememberedAnswer[] }>(tenantId, "wj.career"),
    readClientStateVersioned<{ policy?: Record<string, string>; defaultLevel?: AutomationLevel }>(tenantId, "wj.automation"),
  ]);
  // An unreadable or missing policy is the default policy: "ask", which the candidate's click satisfies.
  const policy = migratePolicy(automation?.state.policy as never, automation?.version ?? POLICY_VERSION);
  if (resolveCapability("fill_application", policy, automation?.state.defaultLevel ?? "guided") === "skip") {
    return { allowed: false, reason: "Filling forms is turned off in Automation.", fills: [], needsYou: [] };
  }

  const dna = career?.dna ?? EMPTY_DNA;
  const latest = (await resumeFileStore().list(tenantId).catch(() => [])).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const resume: PackFile | undefined = latest ? { kind: "resume", filename: latest.filename, source: "uploaded", versionId: latest.id, provenance: "USER_PROVIDED" } : undefined;
  const pack: ApplicationPackSnapshot = {
    applicationId: "profile",
    jobId: "profile",
    jobTitle: "",
    company: "",
    profile: buildApplicationProfile(dna, { accountEmail: deps.accountEmail, now }),
    memory: career?.answerMemory ?? [],
    answers: [],
    education: educationFacts(dna),
    experience: experienceFacts(dna),
    resume,
    sensitive: await packSensitive(tenantId),
    version: "profile",
    capturedAt: new Date(now).toISOString(),
  };

  let mapped = mapForm({ fields: form.fields }, pack, {}, now);
  // Questions the rules couldn't place: the model names which saved fact answers each — never sees a value.
  const hints: Record<string, AiHint> | null = await (deps.match ?? aiMatchFields)({ formFields: form.fields, fieldMappings: mapped.mappings, pack }, now).catch(() => null);
  if (hints) mapped = mapForm({ fields: form.fields }, pack, {}, now, hints);

  const fills: QuickPlan["fills"] = [];
  for (const m of mapped.mappings) {
    if (m.classification === "human-only" || (m.status !== "pending" && m.status !== "confirmed")) continue;
    if (m.file === "resume" && resume) fills.push({ fieldId: m.fieldId, label: m.label, file: "resume" });
    else if (m.value !== undefined && !m.file) fills.push({ fieldId: m.fieldId, label: m.label, value: m.value });
  }
  const needsYou = mapped.mappings.filter((m) => m.status === "needs_you").map((m) => ({ label: m.label, reason: m.reason ?? "Wonder needs your answer." }));

  let file: QuickPlan["resume"];
  if (resume && fills.some((f) => "file" in f)) {
    const read = await resumeFileStore().read(tenantId, resume.versionId).catch(() => undefined);
    if (read) file = { filename: read.meta.filename, mime: read.meta.mime, base64: read.bytes.toString("base64") };
  }
  const ready = await withIdNumbers(tenantId, file ? fills : fills.filter((f) => !("file" in f)));
  return { allowed: true, fills: ready, needsYou, ...(file ? { resume: file } : {}) };
}
