import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { companyLogo } from "@/server/jobslake/companies";

export const runtime = "nodejs";

/**
 * GET ?d=domain&n=name — a company's logo from JobsLake's cache (fetched the first time it's asked for).
 * Only for companies JobsLake recorded from a real posting; 404 when it has none, so the page shows the
 * company's initial instead.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const u = new URL(req.url);
  const domain = u.searchParams.get("d") ?? undefined;
  const name = u.searchParams.get("n")?.slice(0, 200) ?? undefined;
  const logo = await companyLogo({ domain, name }).catch(() => undefined);
  if (!logo) return new NextResponse(null, { status: 404, headers: { "cache-control": "private, max-age=86400" } });
  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "content-type": logo.type,
      "cache-control": "private, max-age=604800",
      // An image, never a document: no sniffing, nothing runs if it's opened directly.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
