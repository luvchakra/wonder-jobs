import Anthropic from "@anthropic-ai/sdk";
import { classifyStatus, ServerProviderError, type ServerProviderAdapter } from "./types";

/** Anthropic adapter via the official SDK. The user's key is injected per request and never cached. */
export const anthropicAdapter: ServerProviderAdapter = {
  id: "anthropic",
  async complete(apiKey, req) {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
    try {
      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        // Adaptive thinking is on by default for these models; keep effort moderate for short drafting tasks.
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: req.prompt }],
      });
      if (response.stop_reason === "refusal") throw new ServerProviderError("anthropic", "invalid_response", "Anthropic declined this request. Try rephrasing or a different provider.");
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new ServerProviderError("anthropic", "invalid_response", "Anthropic returned an empty response.");
      return { text, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    } catch (e) {
      if (e instanceof ServerProviderError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw classifyStatus("anthropic", 401, "Anthropic");
      if (e instanceof Anthropic.RateLimitError) throw classifyStatus("anthropic", 429, "Anthropic");
      if (e instanceof Anthropic.APIError) throw classifyStatus("anthropic", e.status ?? 500, "Anthropic");
      if (e instanceof Anthropic.APIConnectionError) throw new ServerProviderError("anthropic", "network", "Could not reach Anthropic. Check connectivity and retry.");
      throw new ServerProviderError("anthropic", "unknown", e instanceof Error ? e.message : "Unknown error");
    }
  },
};
