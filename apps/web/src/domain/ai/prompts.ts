/**
 * Which instructions a model call runs under. The browser names one of these; the instructions themselves
 * live only on the server (`server/ai/systemPrompts.ts`), so they never ship in the app's code and a
 * request can't bring its own.
 */
export const PROMPT_IDS = ["resume", "cover_letter", "screening", "follow_up", "form_answer", "insight", "career_history"] as const;
export type PromptId = (typeof PROMPT_IDS)[number];
