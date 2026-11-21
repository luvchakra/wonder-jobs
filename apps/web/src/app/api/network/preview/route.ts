import { hiringRoute } from "@/server/hiringRoute";
import { listingPreview } from "@/server/network/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?page=: a post's attached listing as its public page shows it (title, facts, the start of its description, image). */
export async function GET(req: Request) {
  const page = (new URL(req.url).searchParams.get("page") ?? "").slice(0, 300);
  return hiringRoute(req, async () => ({ preview: await listingPreview(page) }));
}
