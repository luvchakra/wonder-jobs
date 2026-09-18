"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { AI_PROVIDERS, type AIProviderId } from "@/domain/ai/types";
import { useAIStore } from "@/store/ai";
import { formatDate, formatTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Switch } from "@/components/common/Input";
import { PageLoading } from "@/components/common/States";
import { ProviderMark } from "@/components/ai/ProviderMark";
import { BYOKForm } from "@/components/ai/BYOKForm";
import { toast } from "@/components/feedback/Toast";

function AISettingsInner() {
  const params = useSearchParams();
  const config = useAIStore((s) => s.config);
  const usage = useAIStore((s) => s.usage);
  const keysLoaded = useAIStore((s) => s.keysLoaded);
  const platform = useAIStore((s) => s.platform);
  const selectProvider = useAIStore((s) => s.selectProvider);
  const setAllowPlatformFallback = useAIStore((s) => s.setAllowPlatformFallback);
  const wantSwitch = params.get("switch") as AIProviderId | null;
  const totals = useMemo(() => usage.reduce((acc, u) => ({ tokens: acc.tokens + u.inputTokens + u.outputTokens, cost: acc.cost + (u.costUsd ?? 0), calls: acc.calls + 1 }), { tokens: 0, cost: 0, calls: 0 }), [usage]);
  const byProvider = useMemo(() => {
    const m: Partial<Record<AIProviderId, { tokens: number; cost: number; calls: number }>> = {};
    for (const u of usage) {
      const e = (m[u.provider] ??= { tokens: 0, cost: 0, calls: 0 });
      e.tokens += u.inputTokens + u.outputTokens;
      e.cost += u.costUsd ?? 0;
      e.calls += 1;
    }
    return m;
  }, [usage]);
  const use = (id: AIProviderId) => {
    selectProvider(id);
    toast.success(`Now using ${AI_PROVIDERS[id].name}`, id === "wonderjobs" ? "Included in your plan." : `Requests are billed to your ${AI_PROVIDERS[id].name} account.`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="AI provider" description="Use WonderJobs AI or connect your own API key. Wonder never switches your billing without asking." />
      {wantSwitch === "wonderjobs" && config.activeProvider !== "wonderjobs" && (
        <Card className="mb-5 flex items-start gap-3 border-brand-200 bg-brand-50/60">
          <Info className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-ink">Switch to WonderJobs AI?</p>
            <p className="text-[13px] text-ink-2">Your {AI_PROVIDERS[config.activeProvider].name} key stays connected. WonderJobs AI is included in your plan and adds no charge to your provider account.</p>
            <Button size="sm" className="mt-3" onClick={() => use("wonderjobs")}>
              Switch to WonderJobs AI
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="active-provider" className="mb-5">
        <h2 id="active-provider" className="mb-3 text-[15px] font-semibold text-ink">
          Active provider
        </h2>
        <Card className={config.activeProvider === "wonderjobs" ? "border-brand-500 ring-4 ring-brand-100" : ""}>
          <div className="flex items-start gap-3">
            <ProviderMark id="wonderjobs" size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-ink">WonderJobs AI</h3>
                <Badge tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Included in your plan</Badge>
                {config.activeProvider === "wonderjobs" && <Badge tone="brand">Active</Badge>}
              </div>
              <p className="text-[12px] text-ink-3">Matching, ranking and quality checks are always deterministic and explainable. Drafting: {platform?.configured ? `written by ${platform.model} on the platform's own key — no charge to you.` : platform === null ? "checking…" : "template drafts on this deployment (no platform model connected). Connect your own key below for AI-written materials."}</p>
            </div>
            {config.activeProvider !== "wonderjobs" && (
              <Button size="sm" onClick={() => use("wonderjobs")}>
                Use
              </Button>
            )}
          </div>
        </Card>
      </section>

      <section aria-labelledby="byok" className="mb-5">
        <h2 id="byok" className="mb-1 text-[15px] font-semibold text-ink">
          Bring your own key
        </h2>
        <p className="mb-3 text-[12px] text-ink-3">Keys are encrypted at rest, isolated to your account, never logged or shown again after saving, and can be removed any time.</p>
        {!keysLoaded ? (
          <PageLoading rows={2} />
        ) : (
          <div className="flex flex-col gap-3">
            {(["anthropic", "openai", "gemini"] as const).map((id) => (
              <BYOKForm key={id} provider={id} status={config.byok[id]} active={config.activeProvider === id} onUse={() => use(id)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="billing" className="mb-5">
        <h2 id="billing" className="mb-3 text-[15px] font-semibold text-ink">
          If your provider fails
        </h2>
        <Card>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
            <li>Wonder explains what went wrong (key rejected, rate limit, outage).</li>
            <li>You can retry, switch provider, or continue with WonderJobs AI.</li>
            <li>Wonder asks before any switch that changes who gets billed.</li>
          </ol>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-[14px] bg-surface-2 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Fall back to WonderJobs AI automatically</p>
              <p className="text-[12px] text-ink-3">Off by default. When on, a failed BYOK request is retried on WonderJobs AI (included in your plan) without asking.</p>
            </div>
            <Switch checked={config.allowPlatformFallback} onChange={setAllowPlatformFallback} label="Automatic fallback to WonderJobs AI" />
          </div>
        </Card>
      </section>

      <section aria-labelledby="usage">
        <h2 id="usage" className="mb-3 text-[15px] font-semibold text-ink">
          Usage
        </h2>
        <Card>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[20px] font-semibold tracking-tight text-ink">{totals.calls}</p>
              <p className="text-[12px] text-ink-3">requests</p>
            </div>
            <div>
              <p className="text-[20px] font-semibold tracking-tight text-ink">{(totals.tokens / 1000).toFixed(1)}K</p>
              <p className="text-[12px] text-ink-3">tokens</p>
            </div>
            <div>
              <p className="text-[20px] font-semibold tracking-tight text-ink">${totals.cost.toFixed(2)}</p>
              <p className="text-[12px] text-ink-3">est. BYOK cost</p>
            </div>
          </div>
          {Object.keys(byProvider).length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line text-[13px]">
              {(Object.entries(byProvider) as [AIProviderId, { tokens: number; cost: number; calls: number }][]).map(([id, v]) => (
                <li key={id} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2 text-ink">
                    <ProviderMark id={id} size={22} /> {AI_PROVIDERS[id].name}
                  </span>
                  <span className="text-ink-3">
                    {v.calls} req · {(v.tokens / 1000).toFixed(1)}K tokens · {AI_PROVIDERS[id].billing === "byok" ? `~$${v.cost.toFixed(2)}` : "included"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {usage.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-medium text-ink-3">Recent requests</summary>
              <ul className="mt-2 max-h-64 overflow-y-auto text-[12px] text-ink-3">
                {usage.slice(0, 30).map((u) => (
                  <li key={u.id} className="flex justify-between py-1">
                    <span>
                      {formatDate(u.at)} {formatTime(u.at)} · {u.task.replace(/_/g, " ")} · {u.model}
                    </span>
                    <span>
                      {u.inputTokens + u.outputTokens} tok{u.costUsd != null ? ` · $${u.costUsd.toFixed(4)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-3 text-[11px] text-ink-4">BYOK costs are estimates from token counts and public list prices; your provider&apos;s invoice is the source of truth.</p>
        </Card>
      </section>
    </div>
  );
}

export default function AISettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AISettingsInner />
    </Suspense>
  );
}
