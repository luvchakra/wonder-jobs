import { classifyStatus, ServerProviderError, type ServerProviderAdapter } from "./types";

/** OpenAI adapter (Chat Completions). */
export const openaiAdapter: ServerProviderAdapter = {
  id: "openai",
  async complete(apiKey, req) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: req.model, max_completion_tokens: req.maxTokens, messages: [{ role: "system", content: req.system }, { role: "user", content: req.prompt }] }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ServerProviderError("openai", "network", "Could not reach OpenAI. Check connectivity and retry.");
    }
    if (!res.ok) throw classifyStatus("openai", res.status, "OpenAI");
    const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ServerProviderError("openai", "invalid_response", "OpenAI returned an empty response.");
    return { text, model: data.model ?? req.model, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
  },
};
