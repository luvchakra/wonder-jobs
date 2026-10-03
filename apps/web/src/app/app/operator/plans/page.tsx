"use client";
import { useEffect, useState } from "react";
import { PLAN_IDS, type PlanId, type PlanLimits, type PlansConfig } from "@/domain/billing/plans";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Switch } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";

type NumberKey = "scheduledSearches" | "aiDraftsPerMonth" | "roles" | "resumeTemplates";
type FlagKey = "dailySearches" | "keepWatch" | "atsReport" | "applyWithWonder";
const NUMBERS: { key: NumberKey; label: string }[] = [
  { key: "scheduledSearches", label: "Scheduled searches on at once" },
  { key: "aiDraftsPerMonth", label: "WonderJobs AI drafts a month" },
  { key: "roles", label: "Roles (Search as)" },
  { key: "resumeTemplates", label: "Résumé designs (8 = all)" },
];
const FLAGS: { key: FlagKey; label: string }[] = [
  { key: "dailySearches", label: "Daily searches" },
  { key: "keepWatch", label: "Keep watch" },
  { key: "applyWithWonder", label: "Apply with Wonder" },
  { key: "atsReport", label: "ATS report" },
];

/**
 * Operators only: the plans as every account sees them. A change here takes effect on the next
 * request for everyone — no deploy. Prices are what candidates are shown; the payment provider
 * charges what its own price says, so keep the two in step.
 */
export default function OperatorPlansPage() {
  const [state, setState] = useState<{ config: PlansConfig; operator: boolean } | "loading" | "error">("loading");
  const [draft, setDraft] = useState<PlansConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/billing/plans", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { config: PlansConfig; operator: boolean }) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setState(d);
        setDraft(d.config);
      })
      .catch(() => setState("error"));
  }, []);
  if (state === "loading" || !draft) return <PageLoading />;
  if (state === "error") return <EmptyState title="Plans couldn't be loaded" />;
  if (!state.operator) return <EmptyState title="Operators only" body="Changing plans is limited to the operator accounts listed on the server." />;

  const setPlan = (id: PlanId, patch: Partial<PlanLimits>) => setDraft((d) => d && { ...d, plans: { ...d.plans, [id]: { ...d.plans[id], ...patch } } });
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/plans", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const data = (await res.json()) as { config?: PlansConfig; error?: string };
      if (!res.ok || !data.config) throw new Error(data.error ?? "Couldn't save");
      setDraft(data.config);
      toast.success("Plans saved", "In effect for every account from the next request.");
    } catch (e) {
      toast.error("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Plans"
        description={`What each plan allows and costs. ${draft.updatedAt ? `Last changed ${new Date(draft.updatedAt).toLocaleString("en-IN")}${draft.updatedBy ? ` by ${draft.updatedBy}` : ""}.` : "Defaults in use."}`}
        actions={
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const l = draft.plans[id];
          return (
            <Card key={id} className="flex flex-col gap-3">
              <div>
                <label className="text-[12px] font-medium text-ink-3" htmlFor={`${id}-label`}>Name</label>
                <Input id={`${id}-label`} value={l.label} onChange={(e) => setPlan(id, { label: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] font-medium text-ink-3" htmlFor={`${id}-tagline`}>Who it&apos;s for</label>
                <Input id={`${id}-tagline`} value={l.tagline} onChange={(e) => setPlan(id, { tagline: e.target.value })} />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="text-[12px] font-medium text-ink-3" htmlFor={`${id}-price`}>Price a month ({l.currency})</label>
                  <Input id={`${id}-price`} type="number" inputMode="decimal" min={0} step="1" value={l.priceMinor / 100} onChange={(e) => setPlan(id, { priceMinor: Math.round(Number(e.target.value || 0) * 100) })} />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-ink-3" htmlFor={`${id}-ccy`}>Currency</label>
                  <Input id={`${id}-ccy`} value={l.currency} maxLength={3} className="w-20 uppercase" onChange={(e) => setPlan(id, { currency: e.target.value.toUpperCase() })} />
                </div>
              </div>
              {NUMBERS.map((n) => (
                <div key={n.key}>
                  <label className="text-[12px] font-medium text-ink-3" htmlFor={`${id}-${n.key}`}>{n.label}</label>
                  <Input id={`${id}-${n.key}`} type="number" inputMode="numeric" min={0} value={l[n.key]} onChange={(e) => setPlan(id, { [n.key]: Math.max(0, Math.round(Number(e.target.value || 0))) })} />
                </div>
              ))}
              {FLAGS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
                  {f.label}
                  <Switch checked={l[f.key]} onChange={(v) => setPlan(id, { [f.key]: v })} label={`${l.label}: ${f.label}`} />
                </div>
              ))}
            </Card>
          );
        })}
      </div>
      <Card className="mt-4">
        <h2 className="text-[15px] font-semibold text-ink">Payment provider ids</h2>
        <p className="mb-3 text-[12px] text-ink-3">Which Stripe price / Razorpay plan buys which plan. Blank uses the server&apos;s STRIPE_PRICE_ID / RAZORPAY_PLAN_ID (Pro) and STRIPE_PRICE_ID_MAX / RAZORPAY_PLAN_ID_MAX (Max).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["pro", "max"] as const).flatMap((p) =>
            (["stripe", "razorpay"] as const).map((prov) => (
              <div key={`${p}-${prov}`}>
                <label className="text-[12px] font-medium text-ink-3" htmlFor={`ref-${p}-${prov}`}>
                  {draft.plans[p].label} · {prov === "stripe" ? "Stripe price id" : "Razorpay plan id"}
                </label>
                <Input id={`ref-${p}-${prov}`} value={draft.priceRefs[p][prov] ?? ""} placeholder={prov === "stripe" ? "price_…" : "plan_…"} onChange={(e) => setDraft((d) => d && { ...d, priceRefs: { ...d.priceRefs, [p]: { ...d.priceRefs[p], [prov]: e.target.value.trim() || undefined } } })} />
              </div>
            )),
          )}
        </div>
      </Card>
    </div>
  );
}
