import type { AIProviderId } from "@/domain/ai/types";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import type { ServerProviderAdapter } from "./types";

const adapters: Partial<Record<AIProviderId, ServerProviderAdapter>> = { anthropic: anthropicAdapter, openai: openaiAdapter, gemini: geminiAdapter };

export function getServerProvider(id: AIProviderId) {
  return adapters[id];
}
