"use client";
import { useState } from "react";
import type { ApiPlanAdmin } from "@/server/billing/admin";
import { formatApiPrice } from "@/domain/jobslake/apiPlan";
import { Button } from "@/components/common/Button";
import { Chip, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, Note, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";
import { label } from "@/components/billing/admin/shared";

/** JobsLake API pricing: the free allowance, the monthly safety cap, and which sources API keys may reach. */
export default function BillingApiPage() {
  const { data, error, reload } = useAdmin<ApiPlanAdmin>("/api/billing/admin/api-plan");
  return (
    <>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={2} />}
      {data && <Editor key={data.stored?.updatedAt ?? "env"} data={data} />}
    </>
  );
}

function Editor({ data }: { data: ApiPlanAdmin }) {
  const [free, setFree] = useState(String(data.effective.freeMonthly));
  const [cap, setCap] = useState(String(data.effective.maxMonthly));
  const [sources, setSources] = useState<string[]>(data.effective.sourceIds);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await adminFetch<ApiPlanAdmin>("/api/billing/admin/api-plan", { method: "PUT", body: JSON.stringify({ freeMonthly: Number(free), maxMonthly: Number(cap), sourceIds: sources }) });
    setBusy(false);
    if (!r.ok) return toast.error("Couldn't save", r.error.message);
    toast.success("JobsLake API pricing saved", "In effect within a minute on every server.");
  };
  const toggle = (id: string) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const updated = data.stored?.updatedAt ? `Last changed ${new Date(data.stored.updatedAt).toLocaleString("en-IN")}${data.stored.updatedBy ? ` by ${data.stored.updatedBy}` : ""}.` : "From the environment / defaults until saved here.";
  return (
    <>
      <PageTitle
        title="JobsLake API"
        subtitle={`Developer API keys: free searches, the monthly safety cap and reachable sources. ${updated}`}
        actions={
          <Button onClick={save} loading={busy} disabled={!sources.length}>
            Save
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Panel title="Allowance">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="api-free">
                Free searches per account a month
              </label>
              <Input id="api-free" type="number" inputMode="numeric" min={0} value={free} onChange={(e) => setFree(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="api-cap">
                Monthly safety cap (paid or not)
              </label>
              <Input id="api-cap" type="number" inputMode="numeric" min={0} value={cap} onChange={(e) => setCap(e.target.value)} />
            </div>
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            <span className="font-medium text-ink">Pay-as-you-go price</span>{" "}
            {data.price.state === "ready" ? (
              <>
                {formatApiPrice(data.price.price)} (Stripe) ·{" "}
                <a href={data.price.dashboardUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                  change it in Stripe
                </a>
              </>
            ) : data.price.state === "needs_setup" ? (
              "Needs setup — STRIPE_API_PRICE_ID isn't set"
            ) : (
              `Unavailable — ${data.price.reason}`
            )}
          </p>
        </Panel>
        <Panel title="Sources API keys may reach">
          <Note tone="warning">Check each source&apos;s terms allow redistributing its postings before adding it.</Note>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.sources.map((s) => (
              <Chip key={s.id} active={sources.includes(s.id)} onClick={() => toggle(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
