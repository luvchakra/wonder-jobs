import type { AIProviderId } from "@/domain/ai/types";

/** The vendors "WonderJobs AI" (the platform-billed default) can run on. */
export type PlatformVendor = "anthropic" | "openai" | "gemini";

/** Cost-conscious defaults — the mid/small tier per vendor, not the flagship, matching the existing choice of Sonnet over Opus. */
const DEFAULT_MODEL: Record<PlatformVendor, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5-mini",
  gemini: "gemini-3.6-flash",
};

function platformVendor(): PlatformVendor {
  const raw = process.env.WONDERJOBS_AI_PROVIDER?.trim().toLowerCase();
  return raw === "openai" || raw === "gemini" ? raw : "anthropic"; // unset/invalid → the deployment's original, documented default
}

/** WONDERJOBS_AI_KEY always wins (it's the one var operators are told to set); the vendor-named var is a
 * convenience fallback for a deployment that already has one set for other purposes. */
function vendorApiKey(vendor: PlatformVendor): string | undefined {
  if (process.env.WONDERJOBS_AI_KEY) return process.env.WONDERJOBS_AI_KEY;
  if (vendor === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (vendor === "openai") return process.env.OPENAI_API_KEY;
  return process.env.GEMINI_API_KEY;
}

/**
 * Platform-billed model behind "WonderJobs AI". Configured with a server-side key for any of the three
 * supported vendors — `WONDERJOBS_AI_PROVIDER` picks which one (default `anthropic`, preserving every
 * existing deployment's behavior when the variable is unset). Without a key for the chosen vendor, the
 * client falls back to deterministic template drafts and says so.
 */
export function platformAI(): { apiKey: string; model: string; provider: AIProviderId } | null {
  const vendor = platformVendor();
  const apiKey = vendorApiKey(vendor);
  if (!apiKey) return null;
  return { apiKey, model: process.env.WONDERJOBS_AI_MODEL ?? DEFAULT_MODEL[vendor], provider: vendor };
}
