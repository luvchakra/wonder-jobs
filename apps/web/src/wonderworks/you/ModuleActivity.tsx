"use client";
import Link from "next/link";
import { moduleStore } from "@/wonderworks/store";
import type { ModuleId, PipelineStage } from "@/wonderworks/manifest";

export interface ActivityModule {
  id: Exclude<ModuleId, "jobs">;
  label: string;
  /** The module's own name for its Pipeline (Applications, Bookings, My events…). */
  pipelineLabel: string;
  stages: PipelineStage[];
  href: string;
}

/**
 * Analytics across WonderWorks (owner, 2026-11-01: every module): each live module's own saves and Pipeline, counted
 * from that module's store in the chosen range — what was saved, and how many responses sit in each of its stages.
 * Nothing is estimated; a module with nothing in the range says so.
 */
export function ModuleActivity({ modules, since }: { modules: ActivityModule[]; /** Only what happened after this (ms); null for all time. */ since: number | null }) {
  // One subscription per module in the registry's fixed order (see ModuleSaved): not compiled, so the hook order holds.
  "use no memo";
  const per = modules.map((m) => ({ m, saved: moduleStore(m.id)((s) => s.saved), responses: moduleStore(m.id)((s) => s.responses) }));
  const inRange = (at: string) => since === null || Date.parse(at) >= since;
  const rows = per.map(({ m, saved, responses }) => {
    const savedN = Object.values(saved).filter(inRange).length;
    const live = Object.values(responses).filter((r) => inRange(r.at));
    const byStage = m.stages.map((st) => ({ label: st.label, n: live.filter((r) => r.stage === st.id).length })).filter((x) => x.n);
    return { m, savedN, total: live.length, byStage };
  });
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map(({ m, savedN, total, byStage }) => (
        <li key={m.id}>
          <Link href={m.href} className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-[10px] px-2 py-2.5 text-[13px] hover:bg-surface-2">
            <span className="font-medium text-ink">{m.label}</span>
            <span className="text-[12.5px] tabular-nums text-ink-3">
              {savedN || total ? (
                <>
                  {savedN} saved · {total} in {m.pipelineLabel}
                  {byStage.length ? ` (${byStage.map((s) => `${s.n} ${s.label.toLowerCase()}`).join(", ")})` : ""}
                </>
              ) : (
                "Nothing in this range"
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
