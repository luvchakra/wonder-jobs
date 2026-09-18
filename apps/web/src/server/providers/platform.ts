/**
 * Platform-billed model behind "WonderJobs AI". Configured with a server-side
 * Anthropic key; without it the client falls back to deterministic template
 * drafts and says so.
 */
export function platformAI(): { apiKey: string; model: string } | null {
  const apiKey = process.env.WONDERJOBS_AI_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: process.env.WONDERJOBS_AI_MODEL ?? "claude-sonnet-5" };
}
