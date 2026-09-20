export const AI_PROVIDER_IDS = ["wonderjobs", "anthropic", "openai", "gemini"] as const;
export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AIProviderMeta {
  id: AIProviderId;
  name: string;
  tagline: string;
  billing: "platform" | "byok";
  models: { id: string; label: string; default?: boolean }[];
  keyPrefixHint?: string;
  keyPlaceholder?: string;
  docsUrl?: string;
}

export const AI_PROVIDERS: Record<AIProviderId, AIProviderMeta> = {
  wonderjobs: {
    id: "wonderjobs",
    name: "WonderJobs AI",
    tagline: "Included in your plan",
    billing: "platform",
    models: [{ id: "wonder-1", label: "Wonder 1", default: true }],
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    tagline: "Use your API key",
    billing: "byok",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", default: true },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
    keyPrefixHint: "sk-ant-",
    keyPlaceholder: "sk-ant-…",
    docsUrl: "https://console.anthropic.com/",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    tagline: "Use your API key",
    billing: "byok",
    models: [
      { id: "gpt-5", label: "GPT-5", default: true },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
    ],
    keyPrefixHint: "sk-",
    keyPlaceholder: "sk-…",
    docsUrl: "https://platform.openai.com/",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    tagline: "Use your API key",
    billing: "byok",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", default: true },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    ],
    keyPrefixHint: "AIza",
    keyPlaceholder: "AIza…",
    docsUrl: "https://aistudio.google.com/",
  },
};

export interface BYOKStatus {
  provider: AIProviderId;
  connected: boolean;
  /** Masked, e.g. "sk-ant-••••9f2a". Plaintext never leaves the server after save. */
  maskedKey?: string;
  model?: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface AIProviderConfig {
  activeProvider: AIProviderId;
  activeModel: string;
  byok: Partial<Record<AIProviderId, BYOKStatus>>;
  /** Never switch billing without asking (spec §23). */
  allowPlatformFallback: boolean;
}

export type AITask =
  | "candidate_understanding"
  | "job_understanding"
  | "matching"
  | "ranking"
  | "resume_generation"
  | "cover_letter_generation"
  | "screening_answers"
  | "career_insights";

export interface AIUsageRecord {
  id: string;
  at: string;
  provider: AIProviderId;
  model: string;
  task: AITask;
  inputTokens: number;
  outputTokens: number;
  /** USD, when the provider exposes pricing; null for platform billing. */
  costUsd: number | null;
  runId?: string;
}

export type ProviderErrorKind = "auth" | "rate_limit" | "quota" | "network" | "invalid_response" | "not_configured" | "unknown";

export class ProviderError extends Error {
  constructor(public readonly provider: AIProviderId, public readonly kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
