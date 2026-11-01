import { NextResponse } from "next/server";
import { companyLogo } from "@/server/jobslake/companies";

export const runtime = "nodejs";

/**
 * GET ?d=domain&n=name — a company's logo from the company directory every WonderWorks module shares (fetched the first
 * time it's asked for, when the directory refresh hasn't already). Only for companies WorksLake recorded from a real
 * listing; 404 when it has none, so the card shows the company's initial instead.
 *
 * A company's logo is public, so the answer is public too and Vercel's CDN keeps it: a page of cards, in any module,
 * costs the directory one read per company a day, not one per card. `wonderworks/brand/CompanyLogo` builds one
 * canonical URL per company (its domain, else its name), so every module shares the same cached copy.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const domain = u.searchParams.get("d")?.slice(0, 253) || undefined;
  const name = u.searchParams.get("n")?.slice(0, 200) || undefined;
  if (!domain && !name) return new NextResponse(null, { status: 400 });
  let logo: Awaited<ReturnType<typeof companyLogo>>;
  try {
    logo = await companyLogo({ domain, name });
  } catch {
    // The directory couldn't be read: say so without caching it, so the next card asks again.
    return new NextResponse(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!logo) return new NextResponse(null, { status: 404, headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } });
  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "content-type": logo.type,
      // A day in the browser and the CDN, then served stale while it's checked: a logo an admin replaces shows the next day.
      "cache-control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000",
      // An image, never a document: no sniffing, nothing runs if it's opened directly.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
