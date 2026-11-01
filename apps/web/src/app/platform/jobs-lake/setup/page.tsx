"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SetupItem, SetupNeed } from "@/server/jobslake/setup";
import { MODULE_DATA } from "@/domain/jobslake/moduleData";
import { MODULES } from "@/modules/registry";
import { Chip } from "@/components/common/Input";
import { DataTypes } from "./DataTypes";
import { adminFetch, LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";
import { toast } from "@/components/feedback/Toast";

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
export default function SetupTodoPage() {
  const { data, error, reload } = useAdmin<{ items: SetupItem[]; gatewayConfigured: boolean }>("setup");
  const [need, setNeed] = useState<SetupNeed | "all">("all");
  const [mod, setMod] = useState<string | null>(null);
  const items = useMemo(() => (data?.items ?? []).filter((i) => (need === "all" || i.need === need) && (!mod || i.module === mod)), [data, need, mod]);
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
          {!data.gatewayConfigured && <p className="mb-3 text-[12.5px] text-ink-3">The gateway isn&apos;t configured on this deployment, so its sources aren&apos;t listed.</p>}
          <Panel title={items.length ? `${items.length} to fix` : undefined}>
            {items.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-3 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{i.name}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-3">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2" title={MODULE_DATA[i.module as keyof typeof MODULE_DATA]?.info}>
                          {i.moduleLabel} · {i.dataType}
                        </span>{" "}
                        {i.detail}
                      </span>
                    </span>
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
