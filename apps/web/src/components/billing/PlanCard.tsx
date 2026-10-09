"use client";
import { PLAN_RANK, type PaidPlanId } from "@/domain/billing/plans";
import { useEffect, useState } from "react";
import { Crown, CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { BILLING_PROVIDERS, type BillingProviderId, type ProviderAvailability } from "@/domain/billing/types";
import { formatMoney } from "@/domain/billing/format";
import { discountTerm } from "@/domain/billing/discounts";
import { formatDate } from "@/lib/format";
import { useBillingStore } from "@/store/billing";
import { useAuthStore } from "@/store/auth";

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/**
 * Plan & billing. Everything shown comes from `/api/billing`: the plan is what a signature-verified
 * Stripe / Razorpay webhook established, prices are read from the provider, and the payment list is
 * this account's slice of the billing ledger. Paying happens on the provider's own page.
 */
export function PlanCard({ returnState }: { returnState: string | null }) {
  const mode = useAuthStore((s) => s.mode);
  const { data, status, load } = useBillingStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [waiting, setWaiting] = useState(returnState === "success");

  useEffect(() => {
    if (mode !== "demo") void load(returnState !== null);
  }, [mode, load, returnState]);

  // Back from checkout: the redirect proves nothing, so poll until the provider's webhook lands (or give up honestly).
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const id = window.setInterval(async () => {
      tries++;
      const d = await load(true);
      if (d?.plan === "pro" || tries >= 10) {
        window.clearInterval(id);
        setWaiting(false);
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [waiting, load]);

  if (mode === "demo") {
    return (
      <Card id="plan" className="mt-4 scroll-mt-20">
        <p className="text-[15px] font-semibold text-ink">Plan &amp; billing</p>
        <p className="mt-1 text-[13px] text-ink-2">Billing isn&apos;t part of the demo. Create an account to see plans and pay with Razorpay or Stripe.</p>
      </Card>
    );
  }
  if (status !== "ready" || !data) {
    return (
      <Card id="plan" className="mt-4 scroll-mt-20">
        <p className="text-[15px] font-semibold text-ink">Plan &amp; billing</p>
        <p className="mt-1 text-[13px] text-ink-2">{status === "error" ? "Your plan couldn't be loaded just now." : "Checking your plan…"}</p>
        {status === "error" && (
          <Button size="sm" variant="outline" className="mt-3" onClick={() => load(true)}>
            Try again
          </Button>
        )}
      </Card>
    );
  }

  const checkout = async (provider: BillingProviderId, plan: PaidPlanId = "pro") => {
    setBusy(provider);
    try {
      const { url } = await post<{ url: string }>("/api/billing/checkout", { provider, plan });
      window.location.assign(url);
    } catch (e) {
      toast.error("Checkout couldn't start", e instanceof Error ? e.message : undefined);
      setBusy(null);
    }
  };
  const portal = async () => {
    setBusy("portal");
    try {
      const { url } = await post<{ url: string }>("/api/billing/portal");
      window.location.assign(url);
    } catch (e) {
      toast.error("Couldn't open billing", e instanceof Error ? e.message : undefined);
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await post("/api/billing/cancel", { confirm: true });
      toast.success("Cancellation requested", "Razorpay will confirm it shortly. You keep Pro until the end of the period you've paid for.");
      setConfirmCancel(false);
      await load(true);
    } catch (e) {
      toast.error("Couldn't cancel", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const sub = data.subscription;
  const ready = data.providers.filter((p): p is Extract<ProviderAvailability, { state: "ready" }> => p.state === "ready");
  const paid = data.plan !== "free";
  const planLabel = data.plans?.[data.plan]?.label ?? (paid ? "Pro" : "Free");
  const upgrades = (["pro", "max"] as const).filter((p) => PLAN_RANK[p] > PLAN_RANK[data.plan] && data.plans?.[p]);

  return (
    <Card id="plan" className="mt-4 scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-600">
          <Crown className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-ink">Plan &amp; billing</p>
            <Badge tone={paid ? "brand" : "neutral"}>{planLabel}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {data.reason}
            {sub && ` · confirmed by ${BILLING_PROVIDERS[sub.provider].name}`}
          </p>
        </div>
      </div>

      {waiting && <p className="mt-3 rounded-[12px] bg-info-100 px-3 py-2 text-[13px] text-info-600" role="status">Waiting for the payment provider to confirm your payment. Your plan changes as soon as it does — usually within a few seconds.</p>}
      {!waiting && returnState === "success" && !paid && <p className="mt-3 rounded-[12px] bg-warning-100 px-3 py-2 text-[13px] text-warning-600" role="status">The payment provider hasn&apos;t confirmed your payment yet. If you completed it, your plan will update here once it does; you haven&apos;t been charged twice.</p>}
      {returnState === "cancelled" && !paid && <p className="mt-3 rounded-[12px] bg-bg-soft px-3 py-2 text-[13px] text-ink-2" role="status">Checkout was closed before paying. Nothing was charged.</p>}

      {paid && sub && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sub.provider === "stripe" && sub.canManage && (
            <Button size="sm" variant="outline" loading={busy === "portal"} onClick={portal} iconRight={<ExternalLink className="size-3.5" aria-hidden />}>
              Manage billing on Stripe
            </Button>
          )}
          {sub.provider === "razorpay" && !sub.cancelAtPeriodEnd && (
            <Button size="sm" variant="outline" onClick={() => setConfirmCancel(true)}>
              Cancel subscription
            </Button>
          )}
        </div>
      )}

      {data.testing?.allowed && !sub && (
        <div className="mt-4 rounded-[14px] border border-dashed border-brand-300 bg-brand-50/50 p-3">
          <p className="text-[13px] font-semibold text-ink">Try a plan — testing, no payment</p>
          <p className="mt-0.5 text-[12px] text-ink-3">Switch to see exactly what each plan allows. Payments aren&apos;t connected yet, so nothing is charged.</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Plan for testing">
            {(["free", "pro", "max"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={data.plan === p ? "primary" : "outline"}
                aria-pressed={data.plan === p}
                loading={busy === `test-${p}`}
                disabled={!!busy}
                onClick={async () => {
                  setBusy(`test-${p}`);
                  try {
                    await post("/api/billing/test-plan", { plan: p === "free" ? null : p });
                    await load(true);
                    toast.success(`Now testing ${data.plans?.[p]?.label ?? p}`, "Every limit in the app follows it right away.");
                  } catch (e) {
                    toast.error("Couldn't switch", e instanceof Error ? e.message : undefined);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {data.plans?.[p]?.label ?? p}
              </Button>
            ))}
          </div>
        </div>
      )}

      {ready.length > 0 && upgrades.length > 0 && (
        <ul className="mt-4 space-y-3">
          {upgrades.map((p) => {
            const l = data.plans[p];
            const d = ready.some((r) => r.provider === "stripe") ? data.discounts?.[p] : undefined;
            const term = d ? [discountTerm(d), ready.length > 1 ? "with Stripe" : ""].filter(Boolean).join(", ") : "";
            return (
              <li key={p} className="rounded-[14px] border border-line p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[15px] font-semibold text-ink">
                    {l.label} <span className="text-[13px] font-normal text-ink-3">· {l.tagline}</span>
                  </p>
                  {d ? (
                    <p className="text-[14px] font-semibold text-ink">
                      <s className="mr-1 font-normal text-ink-3">{formatMoney(d.regularMinor, d.currency)}</s>
                      {formatMoney(d.amountMinor, d.currency)} <span className="font-normal text-ink-3">/ month{term ? ` · ${term}` : ""}</span>
                    </p>
                  ) : (
                    <p className="text-[14px] font-semibold text-ink">
                      {formatMoney(l.priceMinor, l.currency)} <span className="font-normal text-ink-3">/ month</span>
                    </p>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-ink-2">
                  {l.scheduledSearches} scheduled search{l.scheduledSearches === 1 ? "" : "es"}{l.dailySearches ? ", daily" : ", weekly"}{l.keepWatch ? ", keep watch" : ""} · {l.aiDraftsPerMonth} AI drafts a month · {l.roles} role{l.roles === 1 ? "" : "s"} · {l.resumeTemplates >= 8 ? "all" : l.resumeTemplates} résumé designs
                  {l.applyWithWonder ? " · Apply with Wonder" : ""}
                  {l.atsReport ? " · ATS report" : ""}
                  {(l.highlights ?? []).map((h) => ` · ${h}`).join("")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ready.map(({ provider }) => (
                    <Button key={provider} size="sm" loading={busy === provider} disabled={!!busy} onClick={() => checkout(provider, p)} icon={<CreditCard className="size-4" aria-hidden />}>
                      {l.label} · pay with {BILLING_PROVIDERS[provider].name}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!paid && (
        <ul className="mt-3 space-y-1 text-[12.5px] text-ink-3">
          {data.providers
            .filter((p) => p.state !== "ready")
            .map((p) => (
              <li key={p.provider}>
                {BILLING_PROVIDERS[p.provider].name}: {p.state === "needs_setup" ? "Needs setup — not connected on this deployment yet" : `Unavailable — ${p.reason}`}
              </li>
            ))}
        </ul>
      )}

      {data.payments.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Payments</p>
          <ul className="mt-1 divide-y divide-line text-[13px]">
            {data.payments.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-ink-2">
                  {formatDate(p.at)} · {BILLING_PROVIDERS[p.provider].name}
                </span>
                <span className={p.kind === "payment_failed" ? "text-danger-600" : "text-ink"}>
                  {p.amount != null && p.currency ? formatMoney(p.amount, p.currency) : "—"} {p.kind === "payment_failed" ? "failed" : "paid"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[12px] text-ink-3">
        <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
        You pay on Razorpay&apos;s or Stripe&apos;s own page. WonderJobs never sees your card, UPI or bank details.
      </p>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel your subscription?"
        description="It stops at the end of the period you've already paid for — you keep Pro until then and won't be charged again. Razorpay confirms the change; until it does, this page shows your plan as it is."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep Pro
            </Button>
            <Button variant="danger" loading={busy === "cancel"} onClick={cancel}>
              Cancel at period end
            </Button>
          </>
        }
      >
        {sub?.currentPeriodEnd && <p className="text-[13px] text-ink-2">Paid until {formatDate(sub.currentPeriodEnd)}.</p>}
      </Modal>
    </Card>
  );
}
