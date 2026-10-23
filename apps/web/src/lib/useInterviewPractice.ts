"use client";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useCareerStore } from "@/store/career";
import { useAutomationStore } from "@/store/automation";
import { useRecoverJobs } from "@/components/jobs/useRecoverJobs";
import { resolveCapability } from "@/domain/automation/policy";
import { getClientMode } from "@/lib/mode";
import { useAIService } from "@/lib/useAIService";

/**
 * One application's interview practice: its job, the candidate's profile, whether AI practice is allowed
 * (`interview_practice` through `resolveCapability`: Off hides it; the candidate's press is the "ask"), and
 * `ask` — one call to their AI. `sample` is true where demo/local mode may fall back to sample practice.
 */
export function useInterviewPractice(id: string) {
  const app = useApplicationsStore((s) => s.applications[id]);
  const job = useJobsStore((s) => (app ? s.jobs[app.jobId] : undefined));
  useRecoverJobs([app?.jobId]);
  const dna = useCareerStore((s) => s.dna);
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const service = useAIService();
  const allowed = resolveCapability("interview_practice", policy, level) !== "skip";
  const sample = getClientMode().mode !== "user";
  const ask = async (kind: "interview_quiz" | "interview_flashcards" | "mock_interview" | "mock_review", transcript?: string) => {
    if (!job) throw new Error("The job's details aren't available.");
    if (!allowed) throw new Error("Interview practice is off in Automation.");
    return service().practice({ job, dna, kind, transcript });
  };
  return { app, job, dna, allowed, sample, ask };
}

export const NEEDS_AI = "Practice needs an AI model: WonderJobs AI where it's connected, or your own key in You → AI provider.";
