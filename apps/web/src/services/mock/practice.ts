import type { CareerDNA } from "@/domain/career/types";
import type { Flashcard, MockReview, MockTurn, QuizQuestion } from "@/domain/applications/practice";
import { FLASHCARD_COUNT, QUIZ_LENGTH } from "@/domain/applications/practice";
import type { PrepJob } from "@/domain/applications/interviewPrep";

/**
 * Sample interview practice for demo and local mode only (no model connected there). Never used for a real
 * account: the page checks `getClientMode().mode !== "user"` before calling these.
 */

export function demoQuiz(job: PrepJob): QuizQuestion[] {
  const skills = (job.skills ?? []).length ? job.skills! : ["communication", "planning", "stakeholders", "delivery"];
  return Array.from({ length: QUIZ_LENGTH }, (_, i) => {
    const s = skills[i % skills.length];
    const others = ["Office logistics", "Payroll processing", "Facilities booking"];
    const options = [s, ...others];
    const answer = i % 4;
    [options[0], options[answer]] = [options[answer], options[0]];
    return { q: `Sample question ${i + 1}: which skill does the ${job.title} posting at ${job.company} ask for?`, options, answer, why: `The posting lists ${s}.` };
  });
}

export function demoFlashcards(job: PrepJob, dna: CareerDNA): Flashcard[] {
  const reqs = job.requirements ?? [];
  const skills = job.skills ?? [];
  const base: Flashcard[] = [
    ...skills.map((s) => ({ front: `How have you used ${s}?`, back: `Sample card: pick one example — situation, what you did, the result.${dna.strengths[0] ? ` Tie it to: ${dna.strengths[0]}.` : ""}` })),
    ...reqs.map((r) => ({ front: `They ask for: ${r}`, back: "Sample card: one story that shows it, with a number if you have one." })),
    { front: `Why ${job.company}?`, back: "Sample card: what the company does, why this role, why now." },
  ];
  return Array.from({ length: FLASHCARD_COUNT }, (_, i) => base[i % base.length] ?? { front: `Sample card ${i + 1}`, back: "Sample answer." });
}

export function demoMockQuestion(job: PrepJob, turns: MockTurn[]): string {
  const reqs = job.requirements ?? [];
  if (!turns.length) return `Thanks for joining. To start, tell me briefly about yourself and why the ${job.title} role at ${job.company} interests you.`;
  const r = reqs[(turns.length - 1) % Math.max(1, reqs.length)];
  return r ? `The role asks for this: "${r}". Can you walk me through a time you showed it?` : "Tell me about a recent piece of work you're proud of, and your part in it.";
}

export function demoReview(turns: MockTurn[]): MockReview {
  const answered = turns.filter((t) => t.a.trim().split(/\s+/).length >= 15).length;
  const score = Math.round((answered / Math.max(1, turns.length)) * 70 + 10);
  return {
    score,
    summary: `Sample review (demo): you gave a full answer to ${answered} of ${turns.length} questions. Connect WonderJobs AI or your own AI key for a real review.`,
    strengths: answered ? ["You answered in full sentences."] : [],
    improvements: ["Use situation, action, result for each answer.", "Add one number or outcome to every example."],
  };
}
