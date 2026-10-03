"use client";
import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound } from "lucide-react";
import { AI_PROVIDERS, type BYOKStatus } from "@/domain/ai/types";
import { detectProvider, KEY_GUIDE, type OwnProvider } from "@/domain/ai/keyShape";
import { useAIStore } from "@/store/ai";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { ProviderMark } from "./ProviderMark";
import { toast } from "@/components/feedback/Toast";

const ORDER: OwnProvider[] = ["openai", "anthropic", "gemini"];

/**
 * Use your own AI in three steps a non-technical person can follow: open the one page where keys are
 * made, paste the key here, done. The key's shape says which provider it is, it is tried once before
 * it is kept (a key that doesn't answer is not kept), and the drafts switch to it straight away.
 */
export function ConnectOwnAI() {
  const config = useAIStore((s) => s.config);
  const keysLoaded = useAIStore((s) => s.keysLoaded);
  const connectKey = useAIStore((s) => s.connectKey);
  const revokeKey = useAIStore((s) => s.revokeKey);
  const setBYOK = useAIStore((s) => s.setBYOK);
  const selectProvider = useAIStore((s) => s.selectProvider);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<OwnProvider | null>(null);

  const connected = ORDER.map((id) => config.byok[id]).filter((s): s is BYOKStatus => !!s?.connected);
  const detected = detectProvider(key);

  const connect = async () => {
    const provider = detectProvider(key);
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      await connectKey(provider, key.trim());
      const res = await fetch("/api/ai/keys/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) });
      const data = (await res.json().catch(() => ({}))) as { status?: BYOKStatus; error?: string };
      if (!res.ok) {
        // A key that doesn't answer isn't kept: nothing half-connected is left behind.
        await revokeKey(provider).catch(() => {});
        setError(data.error ? `${AI_PROVIDERS[provider].name} didn't accept this key: ${data.error}` : `${AI_PROVIDERS[provider].name} didn't accept this key.`);
        return;
      }
      if (data.status) setBYOK(data.status);
      selectProvider(provider);
      setKey("");
      toast.success(`${AI_PROVIDERS[provider].name} is connected`, "Your drafts now use it. The key is encrypted and never shown again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {connected.map((s) => {
        const active = config.activeProvider === s.provider;
        return (
          <div key={s.provider} className={`flex flex-wrap items-center gap-3 rounded-[14px] border p-3 ${active ? "border-brand-500 bg-brand-50/40" : "border-line"}`}>
            <ProviderMark id={s.provider} size={36} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-ink">
                {AI_PROVIDERS[s.provider].name}
                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success-600">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {active ? "In use" : "Connected"}
                </span>
              </p>
              <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <KeyRound className="size-3 text-ink-4" aria-hidden /> <span className="font-mono">{s.maskedKey}</span>
                {s.lastVerifiedAt && <span>· worked {formatDate(s.lastVerifiedAt)}</span>}
              </p>
              {s.lastError && <p className="mt-1 text-[12px] text-danger-600">{s.lastError}</p>}
            </div>
            {active ? (
              <Button size="sm" variant="outline" onClick={() => { selectProvider("wonderjobs"); toast.success("Back on WonderJobs AI", `Your ${AI_PROVIDERS[s.provider].name} key stays connected.`); }}>
                Use WonderJobs AI instead
              </Button>
            ) : (
              <Button size="sm" onClick={() => { selectProvider(s.provider); toast.success(`Now using ${AI_PROVIDERS[s.provider].name}`); }}>
                Use it
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-ink-3" onClick={() => void revokeKey(s.provider).then(() => toast.info(`${AI_PROVIDERS[s.provider].name} disconnected`))}>
              Disconnect
            </Button>
          </div>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="own-ai-key" className="text-[13px] font-medium text-ink-2">
          {connected.length ? "Connect another" : "Paste your key"}
        </label>
        <div className="flex gap-2">
          <Input id="own-ai-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => { setKey(e.target.value); setError(null); }} placeholder="Starts with sk-… or AIza…" className="min-w-0 flex-1" disabled={!keysLoaded || busy} />
          <Button type="submit" loading={busy} disabled={!detected || busy}>
            {detected ? `Connect ${AI_PROVIDERS[detected].name}` : "Connect"}
          </Button>
        </div>
        {key.trim().length >= 12 && !detected && !busy && <p className="text-[12px] text-ink-3">That doesn&apos;t look like an OpenAI, Anthropic or Gemini key — they start with sk-, sk-ant- or AIza.</p>}
        {error && (
          <p role="alert" className="text-[13px] text-danger-600">
            {error}
          </p>
        )}
        <p className="text-[12px] text-ink-4">Tried once before it&apos;s kept. Encrypted, never shown again, removable any time. Billed by the provider for what you use — not by WonderJobs.</p>
      </form>

      <div>
        <p className="text-[13px] font-medium text-ink-2">Don&apos;t have a key? Pick where you have an account:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDER.map((id) => (
            <Button key={id} size="sm" variant={guide === id ? "secondary" : "outline"} onClick={() => setGuide(guide === id ? null : id)} aria-expanded={guide === id}>
              {KEY_GUIDE[id].product}
            </Button>
          ))}
        </div>
        {guide && (
          <div className="mt-3 rounded-[14px] bg-surface-2 p-4 text-[13px] text-ink-2">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Open{" "}
                <a href={KEY_GUIDE[guide].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                  {KEY_GUIDE[guide].url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" aria-hidden />
                </a>
                .
              </li>
              {KEY_GUIDE[guide].steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-2 text-[12px] text-ink-3">{KEY_GUIDE[guide].billing}</p>
          </div>
        )}
      </div>
    </div>
  );
}
