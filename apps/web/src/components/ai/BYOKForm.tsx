"use client";
import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { AI_PROVIDERS, type AIProviderId, type BYOKStatus } from "@/domain/ai/types";
import { useAIStore } from "@/store/ai";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Field, Input, Select } from "@/components/common/Input";
import { ProviderMark } from "./ProviderMark";
import { toast } from "@/components/feedback/Toast";

/** Connect / verify / revoke a provider key. The key is sent once over HTTPS and never displayed again. */
export function BYOKForm({ provider, status, active, onUse }: { provider: Exclude<AIProviderId, "wonderjobs">; status?: BYOKStatus; active: boolean; onUse: () => void }) {
  const meta = AI_PROVIDERS[provider];
  const connectKey = useAIStore((s) => s.connectKey);
  const revokeKey = useAIStore((s) => s.revokeKey);
  const setBYOK = useAIStore((s) => s.setBYOK);
  const [key, setKey] = useState("");
  const [model, setModel] = useState(status?.model ?? meta.models.find((m) => m.default)?.id ?? meta.models[0].id);
  const [busy, setBusy] = useState<"save" | "verify" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      await connectKey(provider, key.trim(), model);
      setKey("");
      toast.success(`${meta.name} connected`, "Your key is encrypted and never shown again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the key");
    } finally {
      setBusy(null);
    }
  };
  const verify = async () => {
    setBusy("verify");
    setError(null);
    try {
      const res = await fetch("/api/ai/keys/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) });
      const data = (await res.json()) as { status?: BYOKStatus; error?: string };
      if (data.status) setBYOK(data.status);
      if (!res.ok) setError(data.error ?? "Verification failed");
      else toast.success("Connection works", `${meta.name} answered with ${data.status?.model ?? model}.`);
    } catch {
      setError("Could not reach WonderJobs to verify the key.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("remove");
    try {
      await revokeKey(provider);
      toast.info(`${meta.name} key removed`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the key");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-[20px] border p-5 ${active ? "border-brand-500 ring-4 ring-brand-100" : "border-line"} bg-surface`}>
      <div className="flex items-start gap-3">
        <ProviderMark id={provider} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{meta.name}</h3>
            {status?.connected ? <Badge tone="success" icon={<CheckCircle2 className="size-3.5" aria-hidden />}>Connected</Badge> : <Badge>Not connected</Badge>}
            {active && <Badge tone="brand">Active</Badge>}
          </div>
          <p className="text-[12px] text-ink-3">Use your own {meta.name} API key. Billed by {meta.name}, not WonderJobs.</p>
        </div>
      </div>

      {status?.connected ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <KeyRound className="size-3.5 text-ink-4" aria-hidden /> {status.maskedKey}
            </span>
            <span className="text-ink-3">Connected {status.connectedAt ? formatDate(status.connectedAt) : ""}</span>
            {status.lastVerifiedAt && <span className="text-success-600">Verified {formatDate(status.lastVerifiedAt)}</span>}
          </div>
          {status.lastError && <p className="rounded-[12px] bg-danger-100 px-3 py-2 text-[13px] text-danger-600">{status.lastError}</p>}
          <Field label="Model" htmlFor={`model-${provider}`}>
            <Select
              id={`model-${provider}`}
              value={status.model ?? model}
              onChange={(e) => {
                setModel(e.target.value);
                setBYOK({ ...status, model: e.target.value });
                if (active) useAIStore.getState().setModel(e.target.value);
              }}
            >
              {meta.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            {!active && (
              <Button size="sm" onClick={onUse}>
                Use {meta.name}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={verify} loading={busy === "verify"} disabled={!!busy}>
              Test connection
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" aria-hidden />} onClick={remove} loading={busy === "remove"} disabled={!!busy} className="text-danger-600">
              Remove key
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="API key" htmlFor={`key-${provider}`} hint={`Create one at ${meta.docsUrl?.replace(/^https?:\/\//, "") ?? "your provider console"}.`}>
            <Input id={`key-${provider}`} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={meta.keyPlaceholder} />
          </Field>
          <Field label="Default model" htmlFor={`model-${provider}`}>
            <Select id={`model-${provider}`} value={model} onChange={(e) => setModel(e.target.value)}>
              {meta.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" type="submit" loading={busy === "save"} disabled={key.trim().length < 16 || !!busy} icon={busy === "save" ? undefined : <ShieldCheck className="size-3.5" aria-hidden />}>
              Connect securely
            </Button>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-4">{busy === "save" ? <Loader2 className="size-3 wj-animate-spin" aria-hidden /> : null} Encrypted at rest · never logged · revocable any time</span>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
