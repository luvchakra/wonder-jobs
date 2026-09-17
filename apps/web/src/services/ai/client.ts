"use client";
/** Client-side BYOK provider: the key never leaves the server; we call our own route. */
import { ProviderError, type AIProviderId } from "@/domain/ai/types";
import type { AIProvider, CompletionRequest, CompletionResult } from "./service";

export class RemoteBYOKProvider implements AIProvider {
  constructor(public readonly id: AIProviderId, public readonly model: string) {}
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let res: Response;
    try {
      res = await fetch("/api/ai/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: this.id, model: this.model, task: req.task, system: req.system, prompt: req.prompt, maxTokens: req.maxTokens }),
      });
    } catch {
      throw new ProviderError(this.id, "network", "Could not reach WonderJobs to contact your AI provider. Check your connection and retry.");
    }
    const data = (await res.json().catch(() => ({}))) as Partial<CompletionResult> & { error?: string; kind?: ProviderError["kind"] };
    if (!res.ok || typeof data.text !== "string") throw new ProviderError(this.id, data.kind ?? "unknown", data.error ?? `Provider request failed (${res.status})`);
    return { text: data.text, model: data.model ?? this.model, inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0 };
  }
}
