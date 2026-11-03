import { NextResponse } from "next/server";
import { rateLimit } from "@/server/rateLimit";
import { sharedFor } from "@/server/share/page";
import { shareSummary } from "@/server/share/summary";

export const runtime = "nodejs";

/**
 * GET ?page=/j/<id> | /s/<module>/<id> — the share sheet's summary of a public listing: a one-line hook for the message
 * and a few highlights (on the share image). Built from the listing's public record only, the same for everyone, so the
 * CDN keeps it; `ai` says whether a model wrote it.
 */
export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (!rateLimit(`share-summary:${ip}`, { capacity: 30, refillPerSec: 0.5 }).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const page = new URL(req.url).searchParams.get("page") ?? "";
  const shared = await sharedFor(page).catch(() => null);
  if (!shared) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const summary = await shareSummary(shared.key, shared.input);
  return NextResponse.json(summary, { headers: { "cache-control": "public, max-age=600, s-maxage=21600" } });
}
