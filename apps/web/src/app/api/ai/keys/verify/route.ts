import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { decrypt, secretStore, toStatus } from "@/server/secrets";
import { getServerProvider } from "@/server/providers";
import { ServerProviderError } from "@/server/providers/types";

export const runtime = "nodejs";

/** Makes one tiny request with the stored key so the user can confirm it works. */
export async function POST(req: Request) {
  const { tenantId } = await getSession();
  const rl = rateLimit(`verify:${tenantId}`, { capacity: 5, refillPerSec: 0.1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many checks. Try again shortly." }, { status: 429 });
  const body = z.object({ provider: z.enum(["anthropic", "openai", "gemini"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const secret = await secretStore.get(tenantId, body.data.provider);
  if (!secret) return NextResponse.json({ error: "No key connected for this provider." }, { status: 404 });
  const adapter = getServerProvider(body.data.provider);
  if (!adapter) return NextResponse.json({ error: "Provider not supported." }, { status: 400 });
  try {
    await adapter.complete(decrypt(secret.ciphertext), { model: secret.model ?? "", system: "Reply with the single word OK.", prompt: "Connection check.", maxTokens: 16 });
    const updated = { ...secret, lastVerifiedAt: new Date().toISOString(), lastError: undefined };
    await secretStore.put(tenantId, updated);
    return NextResponse.json({ status: toStatus(updated) });
  } catch (e) {
    const message = e instanceof ServerProviderError ? e.message : "Verification failed.";
    const updated = { ...secret, lastError: message };
    await secretStore.put(tenantId, updated);
    return NextResponse.json({ status: toStatus(updated), error: message, kind: e instanceof ServerProviderError ? e.kind : "unknown" }, { status: e instanceof ServerProviderError ? e.status : 502 });
  }
}
