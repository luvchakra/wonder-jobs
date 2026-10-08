import { NextResponse } from "next/server";
import { setDigestEnabled, verifyDigestUnsubscribe } from "@/server/digest/send";

export const runtime = "nodejs";

const page = (body: string, status = 200) =>
  new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>WonderJobs emails</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#111827">${body}</body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function check(req: Request): string | null {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const s = url.searchParams.get("s") ?? "";
  return u && verifyDigestUnsubscribe(u, s) ? u : null;
}

/** The email's link: a confirm button, so a mail scanner opening the link can't turn digests off. */
export async function GET(req: Request) {
  if (!check(req)) return page("<p>This link isn't valid. You can turn the digest off in WonderJobs under Account.</p>", 400);
  return page(`<h1 style="font-size:20px">Stop activity digests?</h1><p>You won't get the WonderJobs activity email any more. You can turn it back on under Account.</p><form method="post"><button type="submit" style="background:#4f46e5;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:600">Stop these emails</button></form>`);
}

/** The confirm button, and mail apps' one-click unsubscribe (RFC 8058). The signed link is the credential. */
export async function POST(req: Request) {
  const tenantId = check(req);
  if (!tenantId) return page("<p>This link isn't valid.</p>", 400);
  await setDigestEnabled(tenantId, false);
  return page("<h1 style=\"font-size:20px\">Done</h1><p>You won't get activity digests any more. Turn them back on any time under Account.</p>");
}
