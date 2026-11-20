import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { MAX_COLLECT_HOPS, runGatewayCollection } from "@/server/gateway/collectJob";
import { siteUrl } from "@/lib/siteUrl";
import { MODULE_IDS } from "@/wonderworks/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler → Gateway collection (server/gateway/collectJob.ts): live sources that are due are collected, a Setup job
 * is carried on (and waiting sources queued, when the Scheduler says so), and Find is refreshed when anything new
 * arrived. Vercel Cron (daily) and GitHub Actions (hourly) call it with `CRON_SECRET` as `Authorization: Bearer …`.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // `hop`: a follow-up call of a collection chain (collectJob.ts::handOnCollection), only ever sent with the secret.
  const hop = Math.min(Math.max(Number.parseInt(new URL(req.url).searchParams.get("hop") ?? "0", 10) || 0, 0), MAX_COLLECT_HOPS);
  const chain = new URL(req.url).searchParams.get("chain") ?? undefined;
  // `refresh`: modules an earlier call of the chain ran out of time to refresh (only module ids are kept).
  const refresh = (new URL(req.url).searchParams.get("refresh") ?? "").split(",").filter((m): m is (typeof MODULE_IDS)[number] => (MODULE_IDS as readonly string[]).includes(m));
  // Driven from outside (the GitHub workflow calls each `next` itself): no call from this app to itself, which Vercel
  // refuses after about five in a row (508 Loop Detected).
  const external = req.headers.get("x-wj-driver") === "external";
  const r = await runGatewayCollection("cron", siteUrl().origin, undefined, hop, external ? async () => true : undefined, chain, refresh);
  console.info("[gateway-collect]", r.summary);
  return NextResponse.json(r);
}
