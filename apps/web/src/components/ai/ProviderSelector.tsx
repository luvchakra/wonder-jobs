"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { AI_PROVIDERS, type AIProviderConfig, type AIProviderId } from "@/domain/ai/types";
import { cn } from "@/lib/cn";
import { ProviderMark } from "./ProviderMark";
import { Badge } from "@/components/common/Badge";

/** Reflects the account's real provider configuration; BYOK options without a key are shown but disabled. */
export function ProviderSelector({ config, value, onChange, className }: { config: AIProviderConfig; value: AIProviderId; onChange: (id: AIProviderId) => void; className?: string }) {
  const byokIds: AIProviderId[] = ["anthropic", "openai", "gemini"];
  const connected = byokIds.filter((id) => config.byok[id]?.connected);
  const byokActive = byokIds.includes(value);
  return (
    <div role="radiogroup" aria-label="AI provider" className={cn("flex flex-col gap-2", className)}>
      <button type="button" role="radio" aria-checked={value === "wonderjobs"} onClick={() => onChange("wonderjobs")} className={cn("flex items-center gap-3 rounded-[14px] border p-3 text-left transition-colors", value === "wonderjobs" ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-100" : "border-line bg-surface hover:border-line-strong")}>
        <Radio active={value === "wonderjobs"} />
        <span className="flex-1">
          <span className="block text-[14px] font-semibold text-ink">WonderJobs AI</span>
          <span className="block text-[12px] text-ink-3">Included in your plan</span>
        </span>
        <ProviderMark id="wonderjobs" size={30} />
      </button>
      <div className={cn("rounded-[14px] border p-3", byokActive ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-100" : "border-line bg-surface")}>
        <div className="flex items-center gap-3">
          <Radio active={byokActive} />
          <span className="flex-1">
            <span className="block text-[14px] font-semibold text-ink">Bring Your Own Key (BYOK)</span>
            <span className="block text-[12px] text-ink-3">{connected.length ? "Use your own API key" : "Connect a key in AI settings to use this"}</span>
          </span>
          <span className="flex -space-x-1.5">
            {byokIds.map((id) => (
              <ProviderMark key={id} id={id} size={26} className={cn(!config.byok[id]?.connected && "opacity-40")} />
            ))}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 pl-8">
          {byokIds.map((id) => {
            const ok = !!config.byok[id]?.connected;
            const active = value === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={active} disabled={!ok} onClick={() => onChange(id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium", active ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-surface text-ink-2", !ok && "opacity-50")} title={ok ? `Use ${AI_PROVIDERS[id].name}` : `${AI_PROVIDERS[id].name} key not connected`}>
                {AI_PROVIDERS[id].name}
                {ok ? <Badge tone={active ? "neutral" : "success"} className={cn("px-1.5 py-0.5", active && "bg-white/20 text-white")}>Connected</Badge> : null}
              </button>
            );
          })}
          <Link href="/app/settings/ai" className="inline-flex h-8 items-center text-[12px] font-medium text-brand-600 hover:underline">
            Manage keys
          </Link>
        </div>
      </div>
    </div>
  );
}

function Radio({ active }: { active: boolean }) {
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong")} aria-hidden>
      {active && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}
