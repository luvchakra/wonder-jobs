import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { decrypt, secretStore } from "@/server/secrets";
import { getServerProvider } from "@/server/providers";
import { ServerProviderError } from "@/server/providers/types";
import { platformAI } from "@/server/providers/platform";
import { tenantPlan } from "@/server/billing/service";
import { countDraft, draftUsage } from "@/server/billing/plansConfig";
import { draftQuota } from "@/domain/billing/plans";
import { PROMPT_IDS, type PromptId } from "@/domain/ai/prompts";
import { leaksInstructions, systemPrompt } from "@/server/ai/systemPrompts";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.enum(["wonderjobs", "anthropic", "openai", "gemini"]),
  model: z.string().trim().min(1).max(80).optional(),
  task: z.string().max(40),
  promptId: z.enum(PROMPT_IDS),
  prompt: z.string().max(60_000),
  maxTokens: z.number().int().min(16).max(8_192).optional(),
});

/**
 * BYOK completion proxy. The browser never holds the key: it names a provider,
 * the server decrypts the tenant's key, calls the vendor and returns text +
 * usage. Nothing about the request is logged. The model's instructions come from the server
 * (`systemPrompt`), named by `promptId`: a request can't bring its own.
 */
/** A draft that repeats its own instructions is never returned. Extraction is exempt: its reply follows the JSON shape its instructions spell out. */
function repeatsInstructions(promptId: PromptId, text: string, system: string) {
  return promptId !== "career_history" && leaksInstructions(text, system);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const rl = rateLimit(`complete:${tenantId}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "You're sending requests too quickly. Wonder will retry shortly.", kind: "rate_limit" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request. Reload the page and try again.", kind: "invalid_response" }, { status: 400 });
  const { provider, model, promptId, prompt, maxTokens } = parsed.data;
  const system = systemPrompt(promptId);
  if (provider === "wonderjobs") {
    const platform = platformAI();
    if (!platform) return NextResponse.json({ error: "WonderStar AI isn't connected to a model on this deployment yet.", kind: "not_configured" }, { status: 409 });
    // Drafts on the platform's key count against the plan; a connected own-AI key never comes through here.
    const { plan, limits, config } = await tenantPlan(tenantId);
    const quota = draftQuota(limits.aiDraftsPerMonth, await draftUsage(tenantId));
    if (!quota.allowed) return NextResponse.json({ error: `You've used this month's ${quota.limit} WonderStar AI drafts on ${config.plans[plan].label}. Connect your own AI (no limit) or move up a plan.`, kind: "quota", plan, limit: quota.limit }, { status: 402 });
    try {
      const result = await getServerProvider(platform.provider)!.complete(platform.apiKey, { model: platform.model, system, prompt, maxTokens: maxTokens ?? 2048 });
      await countDraft(tenantId).catch(() => {});
      if (repeatsInstructions(promptId, result.text, system)) return NextResponse.json({ error: "WonderStar AI couldn't write this draft. Try again.", kind: "invalid_response" }, { status: 502 });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof ServerProviderError) return NextResponse.json({ error: e.message.replace("your API key", "the platform key"), kind: e.kind }, { status: e.status });
      return NextResponse.json({ error: "WonderStar AI request failed.", kind: "unknown" }, { status: 502 });
    }
  }
  const secret = await secretStore.get(tenantId, provider);
  if (!secret) return NextResponse.json({ error: `No ${provider} API key is connected. Add one in AI settings or switch to WonderStar AI.`, kind: "not_configured" }, { status: 409 });
  const adapter = getServerProvider(provider);
  if (!adapter) return NextResponse.json({ error: "Provider not supported.", kind: "not_configured" }, { status: 400 });
  try {
    const result = await adapter.complete(decrypt(secret.ciphertext), { model: model || secret.model || "", system, prompt, maxTokens: maxTokens ?? 2048 });
    if (repeatsInstructions(promptId, result.text, system)) return NextResponse.json({ error: "Your AI couldn't write this draft. Try again.", kind: "invalid_response" }, { status: 502 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ServerProviderError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.status });
    return NextResponse.json({ error: "The provider request failed.", kind: "unknown" }, { status: 502 });
  }
}
