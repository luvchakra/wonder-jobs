"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { formatApiPrice } from "@/domain/jobslake/apiPlan";
import { formatDate, relativeTime } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import type { ApiAccountStatus } from "@/server/jobslake/apiBilling";
import type { ApiKeyView } from "@/server/jobslake/developer";

const RETURN_TOAST: Record<string, [ok: boolean, title: string, detail?: string]> = {
  enabled: [true, "Pay-as-you-go is on", "Searches past the free limit are billed through Stripe."],
  pending: [false, "Stripe hasn't confirmed the subscription yet", "We'll check again within a day."],
  mismatch: [false, "That checkout belongs to another account"],
  failed: [false, "Pay-as-you-go couldn't be turned on", "Try again in a minute."],
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** Usage/billing and the keys list; null for whichever couldn't be read. */
const fetchAll = () => Promise.all([call<ApiAccountStatus>("/api/jobs-lake/api-billing").catch(() => null), call<{ keys: ApiKeyView[] }>("/api/jobs-lake/keys").then((r) => r.keys).catch(() => null)]);

/**
 * Account → JobsLake API: use JobsLake from your own code with an API key. Every number is the
 * account's real metered usage; the price is the one Stripe has. Folded until wanted.
 */
export function JobsLakeApiCard({ returnState }: { returnState: string | null }) {
  const mode = useAuthStore((s) => s.mode);
  const [status, setStatus] = useState<ApiAccountStatus | null>(null);
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, k] = await fetchAll();
    setStatus(s);
    setKeys(k);
  }, []);

  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    void fetchAll().then(([s, k]) => {
      if (!alive) return;
      setStatus(s);
      setKeys(k);
    });
    return () => {
      alive = false;
    };
  }, [mode]);

  useEffect(() => {
    const t = returnState ? RETURN_TOAST[returnState] : undefined;
    if (!t) return;
    if (t[0]) toast.success(t[1], t[2]);
    else toast.error(t[1], t[2]);
  }, [returnState]);

  if (mode !== "user") return null;

  const create = async () => {
    setBusy("create");
    try {
      const r = await call<{ key: string }>("/api/jobs-lake/keys", { method: "POST", body: JSON.stringify({ name }) });
      setCreated(r.key);
      setName("");
      await load();
    } catch (e) {
      toast.error("Couldn't create a key", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await call(`/api/jobs-lake/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error("Couldn't revoke the key", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  /** Stripe Checkout to turn pay-as-you-go on, or Stripe's portal to manage or cancel it. */
  const openBilling = async (manage: boolean) => {
    setBusy("billing");
    try {
      const { url } = await call<{ url: string }>("/api/jobs-lake/api-billing", { method: "POST", body: JSON.stringify(manage ? { manage: true } : {}) });
      window.location.assign(url);
    } catch (e) {
      toast.error(manage ? "Couldn't open billing" : "Couldn't open checkout", e instanceof Error ? e.message : undefined);
      setBusy(null);
    }
  };

  const active = (keys ?? []).filter((k) => !k.revokedAt);
  const n = (x: number) => x.toLocaleString("en-US");
  const usage = !status ? undefined : status.usedThisMonth > status.freeMonthly ? `${n(status.usedThisMonth)} searches this month — ${n(status.freeMonthly)} free, ${n(status.usedThisMonth - status.freeMonthly)} pay-as-you-go` : `${n(status.usedThisMonth)} of ${n(status.freeMonthly)} free searches used this month`;
  const b = status?.billing;

  return (
    <div id="jobslake-api" className="mt-4 scroll-mt-20">
      <Fold title="JobsLake API" hint={usage ?? "Search jobs from your own code"} open={returnState !== null || undefined}>
        <div className="flex flex-col gap-4 text-[13px]">
          {!status && !keys && <p className="text-ink-3">The API isn&apos;t reachable just now.</p>}

          {created && (
            <div className="rounded-[12px] border border-line bg-surface-2 p-3">
              <p className="font-medium text-ink">Your new key — copy it now. You won&apos;t see it again.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{created}</code>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Copy className="size-4" aria-hidden />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(created).then(() => toast.success("Key copied"));
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          {active.length > 0 && (
            <ul className="divide-y divide-line">
              {active.map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{k.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      <span className="font-mono">{k.prefix}…</span> · Created {formatDate(k.createdAt)} · {k.lastUsedAt ? `Used ${relativeTime(k.lastUsedAt)}` : "Never used"}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" loading={busy === k.id} onClick={() => void revoke(k.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {keys && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <Input aria-label="Key name" placeholder="Key name, e.g. My app" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" disabled={!name.trim()} loading={busy === "create"}>
                Create key
              </Button>
            </form>
          )}

          {b && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-ink-2">
                {b.state === "active" && `Pay-as-you-go is on${b.price ? `: ${formatApiPrice(b.price)} past the free limit` : ""}.`}
                {b.state === "available" && `Past the free limit: ${formatApiPrice(b.price)} with pay-as-you-go.`}
                {b.state === "unavailable" && `${b.reason} — the free limit is a hard stop.`}
              </p>
              {b.state === "available" && (
                <Button size="sm" variant="secondary" loading={busy === "billing"} onClick={() => void openBilling(false)}>
                  Enable pay-as-you-go
                </Button>
              )}
              {b.state === "active" && (
                <Button size="sm" variant="ghost" loading={busy === "billing"} onClick={() => void openBilling(true)}>
                  Manage
                </Button>
              )}
            </div>
          )}

          <a href="/api/jobs-lake/v1/protocol" target="_blank" rel="noreferrer" className="text-[12px] text-brand-600 hover:underline">
            API reference — endpoints, MCP and the sources a key can reach
          </a>
        </div>
      </Fold>
    </div>
  );
}
