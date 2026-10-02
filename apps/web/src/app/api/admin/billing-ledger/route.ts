import { NextResponse } from "next/server";
import { bearerMatches } from "@/server/crypto";
import { billingStore } from "@/server/billing/store";
import { verifyLedgerChain, type LedgerRow } from "@/server/billing/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 1000;
const MAX_ROWS = 200_000;

/**
 * Read-only auditor access to the billing ledger (segregation of duties): `BILLING_AUDITOR_TOKEN`
 * can verify and export the ledger but can't deploy, migrate, change a subscription or write a row.
 * GET → chain verification summary; `?format=csv` → the full ledger as CSV.
 */
export async function GET(req: Request) {
  if (!process.env.BILLING_AUDITOR_TOKEN) return NextResponse.json({ error: "BILLING_AUDITOR_TOKEN is not configured on this deployment" }, { status: 503 });
  if (!bearerMatches(req, process.env.BILLING_AUDITOR_TOKEN)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows: LedgerRow[] = [];
  let after = 0;
  for (;;) {
    const page = await billingStore().ledgerPage(after, PAGE);
    rows.push(...page);
    if (page.length < PAGE || rows.length >= MAX_ROWS) break;
    after = page[page.length - 1].seq;
  }
  const verification = verifyLedgerChain(rows);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    const cols: (keyof LedgerRow)[] = ["seq", "recordedAt", "provider", "eventId", "providerType", "kind", "tenantId", "subscriptionId", "amount", "currency", "occurredAt", "payloadSha256", "outcome", "prevHash", "hash"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      // Neutralise spreadsheet formula injection as well as quoting.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="billing-ledger-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store", "x-ledger-verified": String(verification.ok) } });
  }
  return NextResponse.json({ verification, truncated: rows.length >= MAX_ROWS }, { headers: { "cache-control": "no-store" } });
}
