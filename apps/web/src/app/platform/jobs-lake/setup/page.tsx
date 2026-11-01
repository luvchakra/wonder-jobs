"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { SetupItem, SetupNeed } from "@/server/jobslake/setup";
import { MODULE_DATA } from "@/domain/jobslake/moduleData";
import { MODULES } from "@/modules/registry";
import { Chip } from "@/components/common/Input";
import { DataTypes } from "./DataTypes";
import { adminFetch, LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";
import { toast } from "@/components/feedback/Toast";

const REGION = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();
/** "IN" → "India"; "global" → "Worldwide"; "remote" → "Remote". */
function countryLabel(c: string): string {
  if (c === "global") return "Worldwide";
  if (c === "remote") return "Remote";
  try {
    return REGION?.of(c) ?? c;
  } catch {
    return c;
  }
}

const NEEDS: { value: SetupNeed | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "decision", label: "Your decisions" },
  { value: "key", label: "API key" },
  { value: "terms", label: "Terms to confirm" },
  { value: "add", label: "Not added" },
  { value: "activate", label: "Test & activate" },
  { value: "connection", label: "Partner setup" },
  { value: "other", label: "Other" },
];

/**
 * Every source that still needs something from the admin, across every module and the gateway, in one list to work
 * through one by one (owner, 2026-11-01): what's missing, which module and data type it serves, and where to fix it.
 */
type Run = NonNullable<SetupItem["run"]>;

/**
 * One press does the gateway's steps in order (owner, 2026-11-01: "make the setup buttons do it directly"): add the
 * reviewed source from the catalogue (it starts paused), test it, activate it only if the test found valid listings,
 * then collect once so its listings show now instead of at the next hourly run. Each step is the same admin call the
 * Gateway page makes, audited the same way; a failed step stops and says which.
 */
async function runSetup(run: Run, onStep: (s: string) => void): Promise<{ ok: true; valid: number } | { ok: false; step: string; message: string }> {
  const call = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("gateway", { method: "POST", body: JSON.stringify(body) });
  let sourceId = run.kind === "activate" ? run.sourceId : "";
  if (run.kind === "add") {
    onStep("Adding…");
    const r = await call({ action: "add_catalogue", file: run.file });
    if (!r.ok) return { ok: false, step: "Add", message: r.error.message };
    sourceId = String(r.data.id ?? "");
    if (!sourceId) return { ok: false, step: "Add", message: "The gateway didn't return the new source." };
  }
  onStep("Testing…");
  const t = await call({ action: "test", sourceId });
  if (!t.ok) return { ok: false, step: "Test", message: t.error.message };
  const valid = Number(t.data.valid ?? 0);
  if (!valid) return { ok: false, step: "Test", message: "The test found no valid listings, so it stays paused. Open the Gateway page to see why." };
  onStep("Activating…");
  const a = await call({ action: "activate", sourceId });
  if (!a.ok) return { ok: false, step: "Activate", message: a.error.message };
  onStep("Collecting…");
  const c = await call({ action: "collect", sourceId });
  // Active either way; a failed first collection is retried by the hourly run.
  return { ok: true, valid: c.ok ? Number(c.data.valid ?? valid) : valid };
}

function RunButton({ item, onDone }: { item: SetupItem; onDone: () => void }) {
  const [step, setStep] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={!!step}
      onClick={async () => {
        const r = await runSetup(item.run!, setStep);
        setStep(null);
        if (r.ok) toast.success(`${item.name} is live`, `${r.valid} listings collected.`);
        else toast.error(`${r.step} didn't work for ${item.name}`, r.message);
        onDone();
      }}
      className="shrink-0 rounded-full border border-brand-300 px-3 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
    >
      {step ?? item.action.label}
    </button>
  );
}

/**
 * One item, collapsed to its name and module (owner, 2026-11-01: "make the cards collapsed with chevron option"):
 * the chevron opens what it needs and why.
 */
function ItemSummary({ item: i }: { item: SetupItem }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-1.5 text-left">
        <ChevronDown className={`mt-0.5 size-4 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        <span className="min-w-0">
          <span className="font-medium text-ink">{i.name}</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2" title={MODULE_DATA[i.module as keyof typeof MODULE_DATA]?.info}>
              {i.moduleLabel} · {i.dataType}
            </span>
            {i.countries.length > 0 && <span className="ml-1 text-ink-4">{i.countries.map(countryLabel).join(", ")}</span>}
          </span>
        </span>
      </button>
      {open && <span className="mt-1.5 block pl-[22px] text-[12px] text-ink-3">{i.detail}</span>}
    </span>
  );
}

/** Every shown gateway step in one press, one after another (owner, 2026-11-01: "less clicks"). */
function RunAll({ items, onDone }: { items: SetupItem[]; onDone: () => void }) {
  const [step, setStep] = useState<string | null>(null);
  const runnable = items.filter((i) => i.run);
  if (runnable.length < 2) return null;
  const kinds = new Set(runnable.map((i) => i.run!.kind));
  const verb = kinds.size > 1 ? "Set up" : kinds.has("add") ? "Add & activate" : "Test & activate";
  return (
    <button
      type="button"
      disabled={!!step}
      onClick={async () => {
        let live = 0;
        const failed: string[] = [];
        for (const [n, i] of runnable.entries()) {
          const r = await runSetup(i.run!, (s) => setStep(`${n + 1} of ${runnable.length}: ${s}`));
          if (r.ok) live++;
          else failed.push(`${i.name} (${r.step})`);
        }
        setStep(null);
        if (live) toast.success(`${live} of ${runnable.length} live`, failed.length ? `Not live: ${failed.join(", ")}` : "Their listings are collected.");
        else toast.error("None went live", failed.join(", "));
        onDone();
      }}
      className="rounded-full bg-brand-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {step ?? `${verb} all ${runnable.length}`}
    </button>
  );
}

export default function SetupTodoPage() {
  const { data, error, reload } = useAdmin<{ items: SetupItem[]; gatewayConfigured: boolean }>("setup");
  const [need, setNeed] = useState<SetupNeed | "all">("all");
  const [mod, setMod] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // A source for the whole world serves every country; one that doesn't say is shown under every country too.
  const serves = (i: SetupItem, c: string) => !i.countries.length || i.countries.includes(c) || (c !== "global" && c !== "remote" && i.countries.includes("global"));
  const items = useMemo(() => (data?.items ?? []).filter((i) => (need === "all" || i.need === need) && (!mod || i.module === mod) && (!country || serves(i, country))), [data, need, mod, country]);
  const countries = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of data?.items ?? []) for (const c of i.countries) n.set(c, (n.get(c) ?? 0) + 1);
    // India first (WonderWorks' home market), then by how many sources serve it.
    return [...n.entries()].sort((a, b) => (a[0] === "IN" ? -1 : b[0] === "IN" ? 1 : b[1] - a[1]));
  }, [data]);
  const modulesWithItems = useMemo(() => MODULES.filter((m) => data?.items.some((i) => i.module === m.id)), [data]);

  return (
    <>
      <PageTitle title="Setup to-do" subtitle="Everything about data sources that waits on you: your decisions, keys to set, terms to confirm, and gateway sources to add and activate. Fix or decide one, and it leaves the list." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={4} />}
      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="What's needed">
            {NEEDS.map((n) => {
              const count = n.value === "all" ? data.items.length : data.items.filter((i) => i.need === n.value).length;
              if (n.value !== "all" && !count) return null;
              return (
                <Chip key={n.value} active={need === n.value} onClick={() => setNeed(n.value)}>
                  {n.label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </Chip>
              );
            })}
          </div>
          {modulesWithItems.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Module">
              <Chip active={!mod} onClick={() => setMod(null)}>Every module</Chip>
              {modulesWithItems.map((m) => (
                <Chip key={m.id} active={mod === m.id} onClick={() => setMod(m.id)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          )}
          {countries.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Country">
              <Chip active={!country} onClick={() => setCountry(null)}>Every country</Chip>
              {countries.map(([c, n]) => (
                <Chip key={c} active={country === c} onClick={() => setCountry(c)}>
                  {countryLabel(c)} <span className="ml-1 tabular-nums opacity-70">{n}</span>
                </Chip>
              ))}
            </div>
          )}
          {!data.gatewayConfigured && <p className="mb-3 text-[12.5px] text-ink-3">The gateway isn&apos;t configured on this deployment, so its sources aren&apos;t listed.</p>}
          <Panel title={items.length ? `${items.length} to fix` : undefined} action={<RunAll items={items} onDone={reload} />}>
            {items.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-3 text-[13px]">
                    <ItemSummary item={i} />
                    {i.decision ? (
                      <span className="flex shrink-0 items-center gap-2">
                        {i.action.href !== "/platform/jobs-lake/setup" && (
                          <Link href={i.action.href} className="text-[12px] font-medium text-brand-600 hover:underline">
                            {i.action.label}
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await adminFetch("setup", { method: "POST", body: JSON.stringify({ decision: i.id.replace(/^decision:/, ""), done: true }) });
                            if (r.ok) toast.success("Marked done", i.name);
                            else toast.error("Couldn't mark it done", r.error.message);
                            reload();
                          }}
                          className="rounded-full border border-brand-300 px-3 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          Done
                        </button>
                      </span>
                    ) : i.run ? (
                      <RunButton item={i} onDone={reload} />
                    ) : (
                      <Link href={i.action.href} className="shrink-0 rounded-full border border-brand-300 px-3 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50">
                        {i.action.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-ink-4">Nothing to set up here.</p>
            )}
          </Panel>
          <DataTypes />
        </>
      )}
    </>
  );
}
