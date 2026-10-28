import type { Page } from "@playwright/test";

/**
 * A stand-in for the model behind WonderStar AI, for journeys that need one. The web server these specs run on has no
 * platform model, so without this the AI-written parts (practice tests, flashcards, a mock interview, a translation)
 * say they need one — which is also right, and what the app does for anyone without a model. The reply is whatever
 * `reply` returns for that prompt id; the page then handles it exactly as it would a model's.
 */
export async function stubAI(page: Page, reply: (promptId: string, prompt: string) => string | undefined) {
  await page.route("**/api/ai/complete", async (route) => {
    const body = route.request().postDataJSON() as { promptId: string; prompt: string };
    const text = reply(body.promptId, body.prompt);
    if (text === undefined) return route.fallback();
    await route.fulfill({ json: { text, model: "e2e-model", inputTokens: 10, outputTokens: 10 } });
  });
}

const OPTIONS = ["Roadmapping and prioritisation", "Payroll processing", "Facilities booking", "Office logistics"];

/** Valid replies for the interview-practice prompts, in the shapes the practice pages parse. */
export const PRACTICE_REPLIES: Record<string, string> = {
  interview_quiz: JSON.stringify({ questions: Array.from({ length: 10 }, (_, i) => ({ q: `Question text ${i + 1}: which skill does this posting ask for?`, options: OPTIONS, answer: 0, why: "The posting lists it." })) }),
  interview_flashcards: JSON.stringify({ cards: Array.from({ length: 20 }, (_, i) => ({ front: `How have you used skill ${i + 1}?`, back: "Pick one example: situation, what you did, the result." })) }),
  mock_interview: "Thanks for joining. To start, tell me briefly about yourself and why this role interests you.",
  mock_review: JSON.stringify({ score: 72, summary: "A clear answer with one concrete example.", strengths: ["You answered in full sentences."], improvements: ["Add one number or outcome to every example."] }),
};

/** `stubAI` for the practice pages. */
export const stubPractice = (page: Page) => stubAI(page, (promptId) => PRACTICE_REPLIES[promptId]);
