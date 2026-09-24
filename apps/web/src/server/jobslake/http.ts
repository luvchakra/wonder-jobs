import { NextResponse } from "next/server";
import { jlError } from "./access";
import type { Result } from "./service";

const NO_STORE = { "cache-control": "no-store" };

/** REST transport for a service Result: the value as JSON, or the protocol error body. */
export function send<T>(r: Result<T>, status = 200) {
  if (r.ok) return NextResponse.json(r.value, { status, headers: NO_STORE });
  return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
}

export const json = <T>(value: T, status = 200) => NextResponse.json(value, { status, headers: NO_STORE });

/** Reads a JSON body up to `maxBytes`; null when it isn't JSON or is too large. */
export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown | null> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const badJson = () => jlError("INVALID_REQUEST", "Expected a JSON body.", 400);
