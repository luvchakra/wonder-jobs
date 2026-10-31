import { after, NextResponse } from "next/server";
import { hostedGateway } from "@/server/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * WorksLake External Data Gateway API (`/v1/...`, see apps/data-gateway and docs/WORKSLAKE_EXTERNAL_DATA_GATEWAY.md).
 * Not a page and not the app's own API: it has its own keys (consumer keys, one administrator token), its own limits and
 * its own description at /v1/openapi.json. Usage counts are written after the response.
 */
async function serve(req: Request) {
  const hosted = hostedGateway();
  if (!hosted) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "The gateway is not configured on this deployment" } }, { status: 503 });
  const response = await hosted.gateway.handle(req);
  after(() => hosted.store.flush().catch(() => undefined));
  return response;
}
export { serve as GET, serve as POST };
