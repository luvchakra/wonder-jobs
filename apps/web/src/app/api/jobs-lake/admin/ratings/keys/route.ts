import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { exploriumCredits } from "@/server/jobslake/explorium";
import { ratingKeyStore } from "@/server/jobslake/ratingKeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 20;

/** Adds an Explorium API key to the end of the list — after Explorium confirms it works and has credits. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 4_000)) as { key?: unknown; label?: unknown } | null;
  if (!body) return badJson();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) return jlError("INVALID_REQUEST", "That doesn't look like an Explorium API key.", 400);
  const store = ratingKeyStore();
  if ((await store.list()).length >= MAX_KEYS) return jlError("INVALID_REQUEST", `At most ${MAX_KEYS} keys can be on the list.`, 400);
  if (await store.hasSecret(key)) return jlError("INVALID_REQUEST", "That key is already on the list.", 409);
  const credits = await exploriumCredits(key);
  if (credits.kind === "rejected") return jlError("INVALID_REQUEST", "Explorium rejected this key.", 400);
  if (credits.kind === "error") return jlError("SOURCE_UNAVAILABLE", `${credits.message}, so the key couldn't be checked. Try again.`, 502);
  if (credits.remaining <= 0) return jlError("INVALID_REQUEST", "This key has no credits left.", 400);
  const added = await store.add(key, label);
  await store.touch(added.id, { creditsLeft: credits.remaining, creditsCheckedAt: new Date().toISOString() });
  await audit(a.actor, "ratings.key_added", undefined, { masked: added.masked, label, creditsLeft: credits.remaining });
  return json({ key: { ...added, creditsLeft: credits.remaining } }, 201);
}

/** Removes a key from the list (`?id=`). */
export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const store = ratingKeyStore();
  const key = (await store.list()).find((k) => k.id === id);
  if (!key) return jlError("NOT_FOUND", "That key isn't on the list.", 404);
  await store.remove(id);
  await audit(a.actor, "ratings.key_removed", undefined, { masked: key.masked, label: key.label });
  return json({ ok: true });
}
