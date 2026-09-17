import type { AIProviderId, ProviderErrorKind } from "@/domain/ai/types";

export interface ServerCompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ServerCompletionRequest {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface ServerProviderAdapter {
  id: AIProviderId;
  complete(apiKey: string, req: ServerCompletionRequest): Promise<ServerCompletion>;
}

export class ServerProviderError extends Error {
  constructor(public readonly provider: AIProviderId, public readonly kind: ProviderErrorKind, message: string, public readonly status = 502) {
    super(message);
    this.name = "ServerProviderError";
  }
}

/** Map HTTP statuses from vendor APIs to understandable, actionable errors. */
export function classifyStatus(provider: AIProviderId, status: number, vendorName: string): ServerProviderError {
  if (status === 401 || status === 403) return new ServerProviderError(provider, "auth", `${vendorName} rejected your API key. Check the key in AI settings.`, 401);
  if (status === 429) return new ServerProviderError(provider, "rate_limit", `${vendorName} is rate-limiting your key. Wait a moment and retry.`, 429);
  if (status === 402) return new ServerProviderError(provider, "quota", `${vendorName} reports your account is out of credit.`, 402);
  if (status >= 500) return new ServerProviderError(provider, "network", `${vendorName} is temporarily unavailable. Retry, or switch provider.`, 502);
  return new ServerProviderError(provider, "unknown", `${vendorName} returned an unexpected response (${status}).`, 502);
}
