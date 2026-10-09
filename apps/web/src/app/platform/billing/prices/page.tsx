"use client";
import { useState } from "react";
import type { PlanPrices, ProviderPrice } from "@/server/billing/admin";
import { formatMoney } from "@/domain/billing/format";
import { StatusPill } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, Note, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";
import { label, minorDigits, newRequestId, toMinor } from "@/components/billing/admin/shared";

type Data = { plans: PlanPrices[]; providers: { stripe: boolean; razorpay: boolean } };

function charge(p: ProviderPrice): string {
  if (p.state === "needs_setup") return "Needs setup — not connected on this deployment";
  if (p.state === "not_set") return "Not sold here yet";
  if (p.state === "unavailable") return `Unavailable — ${p.reason}`;
  return `${formatMoney(p.amount, p.currency)} every ${p.intervalCount === 1 ? p.interval : `${p.intervalCount} ${p.interval}s`} · ${p.ref}${"active" in p && !p.active ? " · archived" : ""}`;
}

/** Prices: what Stripe and Razorpay will actually charge, read live. Changing one creates a new provider price. */
export default function BillingPricesPage() {
  const { data, error, reload } = useAdmin<Data>("/api/billing/admin/prices");
  const none = data && !data.providers.stripe && !data.providers.razorpay;
  return (
    <>
      <PageTitle title="Prices" subtitle="What each provider charges, read from Stripe and Razorpay just now. Existing subscribers keep the price they signed up at." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={2} />}
      {none && <Note tone="warning">No payment provider is connected on this deployment, so there are no prices to change.</Note>}
      {data && (
        <div className="mt-3 flex flex-col gap-4">
          {data.plans.map((p) => (
            <PlanPrice key={p.plan} p={p} canChange={data.providers.stripe || data.providers.razorpay} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function PlanPrice({ p, canChange, onChanged }: { p: PlanPrices; canChange: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={p.label}
      action={
        canChange && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Change price
          </Button>
        )
      }
    >
      <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        <li>
          <span className="font-medium text-ink">Candidates see</span> {formatMoney(p.display.priceMinor, p.display.currency)} / month{" "}
          <StatusPill tone={p.inSync ? "success" : "warning"} label={p.inSync ? "Matches what's charged" : "Doesn't match what's charged"} />
        </li>
        <li>
          <span className="font-medium text-ink">Stripe</span> {charge(p.stripe)}
        </li>
        <li>
          <span className="font-medium text-ink">Razorpay</span> {charge(p.razorpay)}
        </li>
      </ul>
      <Fold className="mt-3" title="Use an existing price id" hint="Its amount is read from the provider and must match the other provider.">
        <Override plan={p.plan} onDone={onChanged} />
      </Fold>
      <ChangePrice p={p} open={open} onClose={() => setOpen(false)} onDone={onChanged} />
    </Panel>
  );
}

function ChangePrice({ p, open, onClose, onDone }: { p: PlanPrices; open: boolean; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState((p.display.priceMinor / 10 ** minorDigits(p.display.currency)).toFixed(minorDigits(p.display.currency)));
  const [currency, setCurrency] = useState(p.display.currency);
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const minor = toMinor(amount, currency);
  const providers = [p.stripe.state !== "needs_setup" && "Stripe", p.razorpay.state !== "needs_setup" && "Razorpay"].filter(Boolean).join(" and ");
  const submit = async () => {
    if (!Number.isFinite(minor)) return setErr("Enter a price above zero.");
    setBusy(true);
    setErr(null);
    const r = await adminFetch("/api/billing/admin/prices", { method: "POST", body: JSON.stringify({ plan: p.plan, amountMinor: minor, currency, requestId }) });
    setBusy(false);
    if (!r.ok) return setErr(r.error.message);
    toast.success(`${p.label} now costs ${formatMoney(minor, currency)} / month`, "New checkouts use the new price.");
    setRequestId(newRequestId());
    onClose();
    onDone();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change the ${p.label} price`}
      description={`Creates a new monthly price at ${providers || "the connected provider"} and switches new checkouts to it. Existing subscribers keep paying their current price.`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Create price
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className={label} htmlFor={`price-${p.plan}`}>
            Price a month
          </label>
          <Input id={`price-${p.plan}`} type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor={`ccy-${p.plan}`}>
            Currency
          </label>
          <Input id={`ccy-${p.plan}`} value={currency} maxLength={3} className="w-20 uppercase" onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>
      {err && (
        <div className="mt-3">
          <Note tone="danger">{err}</Note>
        </div>
      )}
    </Modal>
  );
}

function Override({ plan, onDone }: { plan: string; onDone: () => void }) {
  const [provider, setProvider] = useState<"stripe" | "razorpay">("stripe");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await adminFetch("/api/billing/admin/prices", { method: "PUT", body: JSON.stringify({ plan, provider, ref: ref.trim() }) });
    setBusy(false);
    if (!r.ok) return toast.error("Not changed", r.error.message);
    toast.success("Price id set", "Candidates now see the amount the provider charges for it.");
    setRef("");
    onDone();
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
      <div>
        <label className={label} htmlFor={`ov-prov-${plan}`}>
          Provider
        </label>
        <Select id={`ov-prov-${plan}`} value={provider} onChange={(e) => setProvider(e.target.value as "stripe" | "razorpay")}>
          <option value="stripe">Stripe price id</option>
          <option value="razorpay">Razorpay plan id</option>
        </Select>
      </div>
      <div>
        <label className={label} htmlFor={`ov-ref-${plan}`}>
          Id
        </label>
        <Input id={`ov-ref-${plan}`} value={ref} placeholder={provider === "stripe" ? "price_…" : "plan_…"} onChange={(e) => setRef(e.target.value)} />
      </div>
      <Button variant="outline" loading={busy} disabled={!ref.trim()} onClick={save}>
        Use this id
      </Button>
    </div>
  );
}
