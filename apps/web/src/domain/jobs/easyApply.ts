import type { CareerDNA } from "@/domain/career/types";
import { historyOf } from "@/domain/career/history";
import type { RememberedAnswer } from "@/domain/jobs-apply/types";
import { savedAnswer, type ScreeningQuestion } from "@/domain/org/screening";

/**
 * Easy Apply, filled from what the candidate already has (owner, 2026-10-28): their Career Profile, their résumés and
 * their saved application answers. Whatever is missing is asked for — only that — and nothing is invented: an answer
 * the candidate never gave stays empty. Pure, so the job page and the tests share it.
 */
export type ResumeSource =
  /** A customized résumé already made for this job, or the newest one made from the Career Profile; sent as Word. */
  | { kind: "saved"; savedId: string; label: string }
  /** One of the files the candidate uploaded. */
  | { kind: "file"; fileId: string; label: string }
  /** None yet: one is made from the Career Profile for this job at send time. */
  | { kind: "generate"; label: string };

export interface EasyApplyPlan {
  details: { name: string; phone: string; location: string; linkedinUrl: string };
  answers: Record<string, string>;
  resume: ResumeSource | null;
  /** What has to be asked before it can send: "name", "resume", or a required question's id. */
  missing: string[];
  /** What the company receives from the Career Profile, beyond the contact details. */
  profile: { headline?: string; skills: string[]; yearsExperience?: number };
}

/** Saved answers to work authorization and sponsorship are used only where the candidate allowed it (Automation → sensitive questions). */
const SENSITIVE = new Set(["workAuthorization", "sponsorship"]);

export function planEasyApply(input: {
  dna: CareerDNA;
  jobId: string;
  memory: RememberedAnswer[];
  files: { id: string; filename: string }[];
  savedResumes: { id: string; name?: string; createdAt: string; target?: { jobId?: string } }[];
  questions: ScreeningQuestion[];
  /** resolveCapability("fill_work_authorization") === "run". */
  allowWorkAuthorization: boolean;
}): EasyApplyPlan {
  const { dna } = input;
  const contact = historyOf(dna).contact;
  const details = { name: dna.name.trim(), phone: contact.phone ?? "", location: contact.location ?? dna.preferredLocations[0] ?? "", linkedinUrl: contact.linkedinUrl ?? "" };
  const answers: Record<string, string> = {};
  for (const q of input.questions) {
    if (q.memoryKey && SENSITIVE.has(q.memoryKey) && !input.allowWorkAuthorization) continue;
    const a = savedAnswer(q, { memory: input.memory, yearsExperience: dna.yearsExperience });
    if (a) answers[q.id] = a;
  }
  const forJob = input.savedResumes.find((r) => r.target?.jobId === input.jobId);
  const newest = [...input.savedResumes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const hasHistory = historyOf(dna).experience.length > 0 || !!historyOf(dna).summary;
  const resume: ResumeSource | null = forJob
    ? { kind: "saved", savedId: forJob.id, label: forJob.name || "Your résumé for this job" }
    : input.files[0]
      ? { kind: "file", fileId: input.files[0].id, label: input.files[0].filename }
      : newest
        ? { kind: "saved", savedId: newest.id, label: newest.name || "Your latest résumé" }
        : hasHistory && dna.name.trim()
          ? { kind: "generate", label: "A résumé made from your Career Profile" }
          : null;
  const missing = [...(details.name.length < 2 ? ["name"] : []), ...(resume ? [] : ["resume"]), ...input.questions.filter((q) => q.required && !answers[q.id]).map((q) => q.id)];
  const profile = { ...(dna.headline ? { headline: dna.headline } : {}), skills: dna.skills.map((s) => s.name).slice(0, 40), ...(dna.yearsExperience > 0 ? { yearsExperience: dna.yearsExperience } : {}) };
  return { details, answers, resume, missing, profile };
}
