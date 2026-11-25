import { hiringRoute } from "@/server/hiringRoute";
import { moduleListing } from "@/server/share/listing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ?module=&id=: a listing a member opened from a post, as its module's own page shows it (owner, 2026-11-23: "take user
 * to the details page of this entry directly"). The same public record its share page reads; for anyone signed in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get("module") ?? "").slice(0, 20);
  const id = (url.searchParams.get("id") ?? "").slice(0, 200);
  return hiringRoute(req, async () => ({ listing: await moduleListing(kind, id) }));
}
