import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { issueProspectKey, prospectAdminView, revokeProspectKey, setOutsideConsumers, setProspectQuotas } from "@/server/gateway/prospectsAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sources → Import → Prospect data (WJ-815): what an outside product may read, its keys, quotas and this month's use. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await prospectAdminView());
}

const whole = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : undefined);

/**
 * The card's actions, each audited: "outside" turns outside consumers on or off; "issue_key" issues the outside
 * product's key (its secret is in this one response and nowhere else); "revoke_key" stops one; "quotas" sets a
 * tenant's monthly allowance and the platform's paid cap.
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 4_000)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const fail = (r: { status: number; body: Record<string, unknown> }) => jlError("INVALID_REQUEST", String((r.body.error as { message?: string } | undefined)?.message ?? "The gateway refused the change."), r.status >= 400 && r.status < 600 ? r.status : 502);

  if (action === "outside") {
    if (typeof body?.on !== "boolean") return jlError("INVALID_REQUEST", "Say on: true or false.", 400);
    const r = await setOutsideConsumers(body.on);
    if (r.status !== 200) return fail(r);
    await audit(a.actor, "prospects.outside_consumers", undefined, { on: body.on });
    return json({ ok: true });
  }
  if (action === "issue_key") {
    const r = await issueProspectKey();
    if (r.status !== 201) return fail(r);
    const record = r.body.record as { id: string; prefix: string };
    // The audit trail names the key by its id and prefix; the secret is never stored or logged.
    await audit(a.actor, "prospects.key_issued", undefined, { keyId: record.id, prefix: record.prefix });
    return json({ ok: true, key: r.body.key, id: record.id, prefix: record.prefix });
  }
  if (action === "revoke_key") {
    const id = typeof body?.id === "string" && /^key_[a-z0-9_]{6,80}$/.test(body.id) ? body.id : "";
    if (!id) return jlError("INVALID_REQUEST", "Name the key.", 400);
    const r = await revokeProspectKey(id);
    if (r.status !== 200) return fail(r);
    await audit(a.actor, "prospects.key_revoked", undefined, { keyId: id });
    return json({ ok: true });
  }
  if (action === "quotas") {
    const search = whole(body?.search), paid = whole(body?.paid), paidPlatformCap = whole(body?.paidPlatformCap);
    if (search === undefined && paid === undefined && paidPlatformCap === undefined) return jlError("INVALID_REQUEST", "Give whole numbers for search, paid or paidPlatformCap.", 400);
    const r = await setProspectQuotas({ search, paid, paidPlatformCap });
    if (r.status !== 200) return fail(r);
    await audit(a.actor, "prospects.quotas", undefined, { ...(search !== undefined ? { search } : {}), ...(paid !== undefined ? { paid } : {}), ...(paidPlatformCap !== undefined ? { paidPlatformCap } : {}) });
    return json({ ok: true });
  }
  return jlError("INVALID_REQUEST", "Unknown action.", 400);
}
