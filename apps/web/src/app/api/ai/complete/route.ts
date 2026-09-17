import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { decrypt, secretStore } from "@/server/secrets";
import { getServerProvider } from "@/server/providers";
import { ServerProviderError } from "@/server/providers/types";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.enum(["anthropic", "openai", "gemini"]),
  model: z.string().trim().min(1).max(80).optional(),
  task: z.string().max(40),
  system: z.string().max(8_000),
  prompt: z.string().max(60_000),
  maxTokens: z.number().int().min(16).max(8_192).optional(),
});

/**
 * BYOK completion proxy. The browser never holds the key: it names a provider,
 * the server decrypts the tenant's key, calls the vendor and returns text +
 * usage. Nothing about the request is logged.
 */
export async function POST(req: Request) {
  const { tenantId } = await getSession();
  const rl = rateLimit(`complete:${tenantId}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "You're sending requests too quickly. Wonder will retry shortly.", kind: "rate_limit" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", kind: "invalid_response" }, { status: 400 });
  const { provider, model, system, prompt, maxTokens } = parsed.data;
  const secret = await secretStore.get(tenantId, provider);
  if (!secret) return NextResponse.json({ error: `No ${provider} API key is connected. Add one in AI settings or switch to WonderJobs AI.`, kind: "not_configured" }, { status: 409 });
  const adapter = getServerProvider(provider);
  if (!adapter) return NextResponse.json({ error: "Provider not supported.", kind: "not_configured" }, { status: 400 });
  try {
    const result = await adapter.complete(decrypt(secret.ciphertext), { model: model || secret.model || "", system, prompt, maxTokens: maxTokens ?? 2048 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ServerProviderError) return NextResponse.json({ error: e.message, kind: e.kind }, { status: e.status });
    return NextResponse.json({ error: "The provider request failed.", kind: "unknown" }, { status: 502 });
  }
}
