"use client";
import { useState } from "react";
import { PLAN_FEATURES, PLAN_IDS, type PlanId, type PlanLimits, type PlansConfig } from "@/domain/billing/plans";
import { MODULES } from "@/modules/registry";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Plus, X } from "lucide-react";
import { Input, Switch } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, PageTitle, useAdmin } from "@/components/jobslake/ui";
import { label } from "@/components/billing/admin/shared";

// What each plan allows, grouped as WonderWorks is (owner, 2026-11-02): limits every module shares, then Jobs' own.
const EVERY = PLAN_FEATURES.filter((f) => f.scope === "every");
const JOBS = PLAN_FEATURES.filter((f) => f.scope === "jobs");
const OTHER_MODULES = MODULES.filter((m) => m.id !== "jobs").map((m) => m.label);
const FEATURE_KEYS = ["label", "tagline", ...PLAN_FEATURES.map((f) => f.key), "highlights"] as const;
const MAX_HIGHLIGHTS = 10;

type Data = { config: PlansConfig; enforcedAt: Record<string, string> };

/** Plans & features: what each plan is called and allows. Prices live on Prices. Every save is audited with a diff. */
export default function BillingPlansPage() {
  const { data, error, reload } = useAdmin<Data>("/api/billing/admin/plans");
  return (
    <>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <Editor key={data.config.updatedAt ?? "defaults"} data={data} />}
    </>
  );
}

function Editor({ data }: { data: Data }) {
  const [draft, setDraft] = useState<PlansConfig>(data.config);
  const [busy, setBusy] = useState(false);
  const setPlan = (id: PlanId, patch: Partial<PlanLimits>) => setDraft((d) => ({ ...d, plans: { ...d.plans, [id]: { ...d.plans[id], ...patch } } }));
  const save = async () => {
    setBusy(true);
    // Blank feature lines are dropped rather than saved.
    const plans = Object.fromEntries(PLAN_IDS.map((id) => [id, Object.fromEntries(FEATURE_KEYS.map((k) => [k, k === "highlights" ? draft.plans[id].highlights.map((h) => h.trim()).filter(Boolean) : draft.plans[id][k]]))]));
    const r = await adminFetch<{ config: PlansConfig; changes: unknown[] }>("/api/billing/admin/plans", { method: "PUT", body: JSON.stringify({ plans }) });
    setBusy(false);
    if (!r.ok) return toast.error("Couldn't save", r.error.message);
    setDraft(r.data.config);
    toast.success(r.data.changes.length ? `Saved ${r.data.changes.length} change${r.data.changes.length === 1 ? "" : "s"}` : "Nothing changed", "In effect for every account from the next request.");
  };
  const updated = draft.updatedAt ? `Last changed ${new Date(draft.updatedAt).toLocaleString("en-IN")}${draft.updatedBy ? ` by ${draft.updatedBy}` : ""}.` : "Defaults in use.";

  return (
    <>
      <PageTitle
        title="Plans & features"
        subtitle={`What each plan is called and allows across WonderWorks: limits every module shares, then Jobs' own. ${OTHER_MODULES.join(", ")} have no limits of their own: their scheduled searches and AI drafts count against the shared ones. ${updated}`}
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
                <label className={label} htmlFor={`${id}-label`}>
                  Name
                </label>
                <Input id={`${id}-label`} value={l.label} onChange={(e) => setPlan(id, { label: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor={`${id}-tagline`}>
                  Who it&apos;s for
                </label>
                <Input id={`${id}-tagline`} value={l.tagline} onChange={(e) => setPlan(id, { tagline: e.target.value })} />
              </div>
              <Section title="Every module" hint="Jobs, Internships, Teaching and every other module share these.">
                {EVERY.map((f) => (
                  <Feature key={f.key} id={id} f={f} l={l} setPlan={setPlan} />
                ))}
              </Section>
              <Section title="Jobs" hint="Only Jobs has these.">
                {JOBS.map((f) => (
                  <Feature key={f.key} id={id} f={f} l={l} setPlan={setPlan} />
                ))}
              </Section>
              <div className="border-t border-line pt-3">
                <p className={label}>More features on pricing</p>
                <p className="mb-2 text-[12px] text-ink-3">Shown as written after the limits above. Display only — keep each line true for {l.label}.</p>
                <ul className="flex flex-col gap-2">
                  {l.highlights.map((h, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Input aria-label={`${l.label}: feature ${i + 1}`} value={h} maxLength={90} placeholder="e.g. Priority support" onChange={(e) => setPlan(id, { highlights: l.highlights.map((x, j) => (j === i ? e.target.value : x)) })} />
                      <Button size="sm" variant="ghost" aria-label={`Remove feature ${i + 1}`} icon={<X className="size-4" aria-hidden />} onClick={() => setPlan(id, { highlights: l.highlights.filter((_, j) => j !== i) })} />
                    </li>
                  ))}
                </ul>
                {l.highlights.length < MAX_HIGHLIGHTS && (
                  <Button size="sm" variant="outline" className="mt-2" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPlan(id, { highlights: [...l.highlights, ""] })}>
                    Add a feature
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <Fold className="mt-4" title="Where each limit is enforced" hint="Server-checked limits can't be bypassed from the browser.">
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
          {[...PLAN_FEATURES, { key: "highlights", label: "More features on pricing" }].map((f) => (
            <li key={f.key}>
              <span className="font-medium text-ink">{f.label}</span> — {data.enforcedAt[f.key] ?? "—"}
            </li>
          ))}
        </ul>
      </Fold>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div>
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="text-[12px] text-ink-3">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** One limit: a number, or a yes/no switch, with what it means. */
function Feature({ id, f, l, setPlan }: { id: PlanId; f: (typeof PLAN_FEATURES)[number]; l: PlanLimits; setPlan: (id: PlanId, patch: Partial<PlanLimits>) => void }) {
  if (f.kind === "number")
    return (
      <div>
        <label className={label} htmlFor={`${id}-${f.key}`}>
          {f.label}
        </label>
        <Input id={`${id}-${f.key}`} type="number" inputMode="numeric" min={0} value={l[f.key] as number} onChange={(e) => setPlan(id, { [f.key]: Math.max(0, Math.round(Number(e.target.value || 0))) })} />
        <p className="mt-1 text-[11.5px] text-ink-4">{f.hint}</p>
      </div>
    );
  return (
    <div className="flex items-start justify-between gap-2 text-[13px] text-ink-2">
      <span>
        {f.label}
        <span className="block text-[11.5px] text-ink-4">{f.hint}</span>
      </span>
      <Switch checked={l[f.key] as boolean} onChange={(v) => setPlan(id, { [f.key]: v })} label={`${l.label}: ${f.label}`} />
    </div>
  );
}
