import { json } from "@/server/jobslake/http";
import { protocolDocument } from "@/server/jobslake/protocolDoc";

export const runtime = "nodejs";

/** GET /api/jobs-lake/v1/protocol — the public Protocol v1 description. Contains no data. */
export async function GET() {
  return json(protocolDocument());
}
