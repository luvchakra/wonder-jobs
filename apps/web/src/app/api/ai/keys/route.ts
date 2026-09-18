import { NextResponse } from "next/server";
import { z } from "zod";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { encrypt, maskKey, secretStore, toStatus } from "@/server/secrets";
import { platformAI } from "@/server/providers/platform";

export const runtime = "nodejs";

const ProviderId = z.enum(["anthropic", "openai", "gemini"]);
const SaveBody = z.object({
  provider: ProviderId,
  apiKey: z.string().trim().min(16).max(512).regex(/^[A-Za-z0-9._\-]+$/, "Key contains unexpected characters"),
  model: z.string().trim().min(1).max(80).optional(),
});

/** GET → masked status only. Plaintext keys are never returned (spec §23). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const keys = (await secretStore.list(tenantId)).map(toStatus);
  const platform = platformAI();
  return NextResponse.json({ keys, platform: platform ? { configured: true, model: platform.model } : { configured: false } }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const rl = rateLimit(`keys:${tenantId}`, { capacity: 10, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = SaveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That doesn't look like a valid API key." }, { status: 400 });
  const { provider, apiKey, model } = parsed.data;
  const meta = AI_PROVIDERS[provider];
  if (meta.keyPrefixHint && !apiKey.startsWith(meta.keyPrefixHint)) {
    return NextResponse.json({ error: `${meta.name} keys usually start with “${meta.keyPrefixHint}”. Double-check you pasted the right key.` }, { status: 400 });
  }
  const chosenModel = model && meta.models.some((m) => m.id === model) ? model : meta.models.find((m) => m.default)?.id;
  let ciphertext: string;
  try {
    ciphertext = encrypt(apiKey);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Encryption unavailable" }, { status: 500 });
  }
  const secret = { provider, ciphertext, masked: maskKey(apiKey), model: chosenModel, connectedAt: new Date().toISOString() };
  await secretStore.put(tenantId, secret);
  return NextResponse.json({ status: toStatus(secret) });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const provider = ProviderId.safeParse(new URL(req.url).searchParams.get("provider"));
  if (!provider.success) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  await secretStore.remove(tenantId, provider.data);
  return NextResponse.json({ ok: true });
}
