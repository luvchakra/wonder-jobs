import { NextResponse } from "next/server";
import { z } from "zod";
import { rememberAnswers } from "@/server/jobsApply/remember";
import { tenantFromAuthHeader } from "@/server/extensionToken";
import { rateLimit } from "@/server/rateLimit";

export const runtime = "nodejs";

const Body = z
  .object({
    items: z
      .array(
        z
          .object({
            label: z.string().min(1).max(300),
            type: z.enum(["text", "textarea", "email", "phone", "url", "select", "radio", "number", "date", "combobox", "unknown"]),
            value: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

/**
 * POST /api/extension/remember — bearer token from `/api/extension/token`.
 *
 * Only ever called when the candidate presses Save on the helper's card: answers they typed on an
 * employer's form, kept for the next form. Routing and the never-save rules live in `rememberAnswers`.
 */
export async function POST(req: Request) {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderJobs again." }, { status: 401, headers: { "cache-control": "no-store" } });
  const rl = rateLimit(`ext-remember:${tenantId}`, { capacity: 20, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  return NextResponse.json(await rememberAnswers(tenantId, parsed.data.items), { headers: { "cache-control": "no-store" } });
}
