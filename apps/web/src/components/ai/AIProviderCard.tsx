"use client";
import Link from "next/link";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { useAIStore } from "@/store/ai";
import { Badge } from "@/components/common/Badge";
import { ProviderMark } from "./ProviderMark";

export function AIProviderCard() {
  const config = useAIStore((s) => s.config);
  const usage = useAIStore((s) => s.usage);
  const meta = AI_PROVIDERS[config.activeProvider];
  const status = config.byok[config.activeProvider];
  const totals = usage.reduce((acc, u) => ({ tokens: acc.tokens + u.inputTokens + u.outputTokens, cost: acc.cost + (u.costUsd ?? 0) }), { tokens: 0, cost: 0 });
  const connected = meta.billing === "platform" || status?.connected;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">Your AI Provider</h2>
        <Link href="/app/settings/ai" className="text-[13px] font-medium text-brand-600 hover:underline">
          Manage
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <ProviderMark id={meta.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-ink">{meta.id === "anthropic" ? "Claude" : meta.name}</p>
            {meta.billing === "byok" && <Badge tone="brand">BYOK</Badge>}
          </div>
          <p className="truncate text-[12px] text-ink-3">{meta.billing === "byok" ? (connected ? `Using your ${meta.name} API key` : "Key not connected") : meta.tagline}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${connected ? "text-success-600" : "text-warning-600"}`}>
          <span className={`size-1.5 rounded-full ${connected ? "bg-success-600" : "bg-warning-600"}`} aria-hidden /> {connected ? "Connected" : "Action needed"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span>{(totals.tokens / 1000).toFixed(1)}K tokens used</span>
        <span>{meta.billing === "byok" ? `~$${totals.cost.toFixed(2)} (billed by ${meta.name})` : "Included in plan"}</span>
      </div>
    </div>
  );
}
