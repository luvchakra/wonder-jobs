"use client";
import { useState } from "react";
import type { AutomaticView, PromoView, StripeState } from "@/server/billing/admin";
import { describeCoupon, discountTerm } from "@/domain/billing/discounts";
import { formatMoney } from "@/domain/billing/format";
import { StatusPill } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Chip, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, ConfirmAction, LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, useAdmin } from "@/components/jobslake/ui";
import { DiscountFields, discountPayload, emptyDiscount, label, newRequestId, type DiscountDraft } from "@/components/billing/admin/shared";

type Data = { stripe: StripeState; promos: PromoView[] | null; promosError?: string; automatic: AutomaticView[] };
const PLAN_LABEL: Record<string, string> = { pro: "Pro", max: "Max" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Discounts: Stripe promotion codes (entered on Stripe's checkout page) and one optional automatic discount per plan. */
export default function BillingDiscountsPage() {
  const { data, error, reload } = useAdmin<Data>("/api/billing/admin/discounts");
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageTitle
        title="Discounts & promo codes"
        subtitle="Held in Stripe, so they really apply at checkout. Razorpay offers are managed in the Razorpay dashboard and don't appear here."
        actions={
          data?.stripe === "ready" && (
            <Button onClick={() => setCreating(true)} disabled={!data}>
              New promo code
            </Button>
          )
        }
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={2} />}
      {data?.stripe === "needs_setup" && <Note tone="warning">Stripe isn&apos;t connected on this deployment — promo codes and discounts need it.</Note>}
      {data?.stripe === "ready" && (
        <div className="flex flex-col gap-4">
          <Panel title="Promo codes">
            {data.promosError ? <Note tone="danger">Unavailable — {data.promosError}</Note> : <Promos promos={data.promos ?? []} onChanged={reload} />}
          </Panel>
          <Fold title="Automatic discount" hint="Applied to every new checkout of a plan, with the regular price struck through on its card.">
            <Automatic list={data.automatic} onChanged={reload} />
          </Fold>
        </div>
      )}
      {creating && <NewPromo onClose={() => setCreating(false)} onDone={reload} />}
    </>
  );
}

function Promos({ promos, onChanged }: { promos: PromoView[]; onChanged: () => void }) {
  const deactivate = async (p: PromoView) => {
    const r = await adminFetch("/api/billing/admin/discounts/promos", { method: "PATCH", body: JSON.stringify({ id: p.id, active: false }) });
    if (!r.ok) return r.error.message;
    toast.success(`${p.code} deactivated`);
    onChanged();
    return null;
  };
  const what = (p: PromoView) => (p.coupon ? describeCoupon(p.coupon, formatMoney) : "—");
  const plans = (p: PromoView) => (p.plans ? p.plans.map((x) => PLAN_LABEL[x] ?? x).join(", ") || "Another product" : "Every product");
  const used = (p: PromoView) => `${p.timesRedeemed}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}`;
  const status = (p: PromoView) => <StatusPill tone={p.active ? "success" : "neutral"} label={p.active ? "Active" : "Inactive"} />;
  const action = (p: PromoView) => (p.active ? <ConfirmAction label="Deactivate" title={`Deactivate ${p.code}?`} body="No one can redeem it from now on. Stripe can't delete a code; past redemptions and the discounts they gave stand." confirmLabel="Deactivate" onConfirm={() => deactivate(p)} /> : null);
  return (
    <ResponsiveTable
      rows={promos}
      rowKey={(p) => p.id}
      empty="No promo codes yet."
      columns={[
        { header: "Code", cell: (p) => <span className="font-mono text-ink">{p.code}</span> },
        { header: "Discount", cell: what },
        { header: "Plans", cell: plans },
        { header: "Used", cell: used },
        { header: "Expires", cell: (p) => day(p.expiresAt) },
        { header: "Status", cell: status },
        { header: "", cell: action },
      ]}
      card={(p) => (
        <div className="flex flex-col gap-1 text-[13px] text-ink-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-medium text-ink">{p.code}</span>
            {status(p)}
          </div>
          <span>
            {what(p)} · {plans(p)}
          </span>
          <span>
            Used {used(p)} · expires {day(p.expiresAt)}
          </span>
          {p.active && <div className="mt-1">{action(p)}</div>}
        </div>
      )}
    />
  );
}

function NewPromo({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [plans, setPlans] = useState<string[]>(["pro", "max"]);
  const [max, setMax] = useState("");
  const [draft, setDraft] = useState<DiscountDraft>(emptyDiscount("INR"));
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const d = discountPayload(draft);
    if (!d.ok) return setErr(d.error);
    const maxRedemptions = max.trim() ? Number(max) : undefined;
    if (maxRedemptions !== undefined && !(Number.isInteger(maxRedemptions) && maxRedemptions >= 1)) return setErr("Max uses is a whole number above zero.");
    setBusy(true);
    setErr(null);
    const r = await adminFetch("/api/billing/admin/discounts/promos", { method: "POST", body: JSON.stringify({ code: code.trim().toUpperCase(), plans, ...(maxRedemptions ? { maxRedemptions } : {}), ...d.value, requestId }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error.message);
    toast.success(`${code.trim().toUpperCase()} is live`, "Candidates can enter it on Stripe's checkout page.");
    onClose();
    onDone();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="New promo code"
      description="Creates a Stripe coupon and its code. Candidates enter it on Stripe's checkout page."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!code.trim() || !plans.length} onClick={submit}>
            Create code
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className={label} htmlFor="promo-code">
            Code
          </label>
          <Input id="promo-code" value={code} maxLength={40} className="font-mono uppercase" placeholder="LAUNCH20" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
        </div>
        <DiscountFields draft={draft} onChange={setDraft} idPrefix="promo" />
        <div>
          <p className={label}>Plans</p>
          <div className="mt-1 flex gap-2">
            {["pro", "max"].map((p) => (
              <Chip key={p} active={plans.includes(p)} onClick={() => setPlans((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))}>
                {PLAN_LABEL[p]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <label className={label} htmlFor="promo-max">
            Max uses (optional)
          </label>
          <Input id="promo-max" type="number" inputMode="numeric" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        {err && <Note tone="danger">{err}</Note>}
      </div>
    </Modal>
  );
}

function Automatic({ list, onChanged }: { list: AutomaticView[]; onChanged: () => void }) {
  const [plan, setPlan] = useState<"pro" | "max" | null>(null);
  const stop = async (p: string) => {
    const r = await adminFetch("/api/billing/admin/discounts/automatic", { method: "DELETE", body: JSON.stringify({ plan: p }) });
    if (!r.ok) return r.error.message;
    toast.success("Automatic discount stopped");
    onChanged();
    return null;
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-ink-3">Stripe allows a discount or the promo-code field on a checkout, not both — while a plan has one, its checkout hides the code field.</p>
      {(["pro", "max"] as const).map((p) => {
        const a = list.find((x) => x.plan === p);
        return (
          <div key={p} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-ink-2">
            <span>
              <span className="font-medium text-ink">{PLAN_LABEL[p]}</span>{" "}
              {!a
                ? "— none"
                : a.discount
                  ? `— ${formatMoney(a.discount.amountMinor, a.discount.currency)} instead of ${formatMoney(a.discount.regularMinor, a.discount.currency)}${discountTerm(a.discount) ? `, ${discountTerm(a.discount)}` : ""}${a.coupon?.redeemBy ? ` · until ${day(a.coupon.redeemBy)}` : ""}`
                  : `— ${a.problem ?? "not applied"}`}
            </span>
            {a ? <ConfirmAction label="Stop" variant="outline" title={`Stop the ${PLAN_LABEL[p]} discount?`} body="New checkouts are charged the regular price. Subscribers who already have it keep it for its duration." confirmLabel="Stop discount" onConfirm={() => stop(p)} /> : <Button size="sm" variant="outline" onClick={() => setPlan(p)}>Set discount</Button>}
          </div>
        );
      })}
      {plan && <NewAutomatic plan={plan} onClose={() => setPlan(null)} onDone={onChanged} />}
    </div>
  );
}

function NewAutomatic({ plan, onClose, onDone }: { plan: "pro" | "max"; onClose: () => void; onDone: () => void }) {
  const [draft, setDraft] = useState<DiscountDraft>(emptyDiscount("INR"));
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const d = discountPayload(draft);
    if (!d.ok) return setErr(d.error);
    setBusy(true);
    setErr(null);
    const r = await adminFetch("/api/billing/admin/discounts/automatic", { method: "POST", body: JSON.stringify({ plan, ...d.value, requestId }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error.message);
    toast.success(`${PLAN_LABEL[plan]} discount on`, "New checkouts get it; the plan card shows the discounted price.");
    onClose();
    onDone();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Automatic ${PLAN_LABEL[plan]} discount`}
      description="Creates a Stripe coupon applied to every new Stripe checkout of this plan. Razorpay checkouts are charged the regular price."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Start discount
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <DiscountFields draft={draft} onChange={setDraft} idPrefix="auto" />
        {err && <Note tone="danger">{err}</Note>}
      </div>
    </Modal>
  );
}
