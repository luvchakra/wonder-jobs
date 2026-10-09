"use client";
import type { AuditEvent } from "@/server/jobslake/types";
import { LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

const ACTION: Record<string, string> = {
  "billing.plans.saved": "Plans & features saved",
  "billing.price.change_requested": "Price change requested",
  "billing.price.changed": "Price changed",
  "billing.price.change_failed": "Price change failed",
  "billing.price.ref_set": "Price id set",
  "billing.promo.create_requested": "Promo code requested",
  "billing.promo.created": "Promo code created",
  "billing.promo.create_failed": "Promo code failed",
  "billing.promo.deactivate_requested": "Promo code deactivation requested",
  "billing.promo.deactivated": "Promo code deactivated",
  "billing.promo.deactivate_failed": "Promo code deactivation failed",
  "billing.discount.set_requested": "Automatic discount requested",
  "billing.discount.set": "Automatic discount started",
  "billing.discount.set_failed": "Automatic discount failed",
  "billing.discount.cleared": "Automatic discount stopped",
  "billing.api_plan.saved": "JobsLake API pricing saved",
};

const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** One line per detail; field diffs as "pro.roles: 3 → 4". */
function details(d: Record<string, unknown> | undefined): string[] {
  if (!d) return [];
  return Object.entries(d).flatMap(([k, v]) => {
    if (k === "changes" && Array.isArray(v)) return v.map((c: { field?: string; from?: unknown; to?: unknown }) => `${c.field}: ${show(c.from)} → ${show(c.to)}`);
    if (Array.isArray(v) && !v.length) return [];
    return [`${k}: ${show(v)}`];
  });
}

/** History: every billing-admin change — who, when, what — from the append-only platform audit trail. */
export default function BillingHistoryPage() {
  const { data, error, reload } = useAdmin<{ events: AuditEvent[] }>("/api/billing/admin/history");
  return (
    <>
      <PageTitle title="History" subtitle="Every billing change, newest first. Requests are recorded before Stripe or Razorpay is called." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel>
          {!data.events.length ? (
            <p className="py-4 text-center text-[13px] text-ink-4">No billing changes yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2.5 text-[13px]">
                  <p className="text-ink">
                    <span className="font-medium">{ACTION[e.action] ?? e.action}</span> <span className="text-ink-3">· {e.actor} · {new Date(e.at).toLocaleString("en-IN")}</span>
                  </p>
                  {details(e.detail).map((line, j) => (
                    <p key={j} className="break-all font-mono text-[11px] text-ink-3">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}
