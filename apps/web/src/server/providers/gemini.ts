import { classifyStatus, ServerProviderError, type ServerProviderAdapter } from "./types";

/** Gemini adapter (Generative Language API, generateContent). */
export const geminiAdapter: ServerProviderAdapter = {
  id: "gemini",
  async complete(apiKey, req) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: "user", parts: [{ text: req.prompt }] }], generationConfig: { maxOutputTokens: req.maxTokens } }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ServerProviderError("gemini", "network", "Could not reach Gemini. Check connectivity and retry.");
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw classifyStatus("gemini", res.status, "Gemini", detail?.error?.message);
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) throw new ServerProviderError("gemini", "invalid_response", "Gemini returned an empty response.");
    return { text, model: req.model, inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0 };
  },
};
