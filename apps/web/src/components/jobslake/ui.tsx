"use client";
/**
 * JobsLake admin primitives, built on the WonderJobs design system (spec §4.3: denser, but the same
 * primitives). Every number these render comes from the admin API; when there's nothing to show they
 * say "No data yet" rather than drawing a zero that looks like a measurement.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { HealthState } from "@/domain/jobslake/health";
import type { SourceStatus } from "@/domain/jobslake/protocol";
import { Badge, StatusPill, type Tone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Modal } from "@/components/common/Modal";
import { Skeleton } from "@/components/common/States";
import { cn } from "@/lib/cn";

export const API = "/api/jobs-lake/admin";

export interface ApiError {
  code: string;
  message: string;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: ApiError; status: number }> {
  try {
    const res = await fetch(path.startsWith("/") ? path : `${API}/${path}`, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const body = (await res.json().catch(() => null)) as (T & { error?: ApiError }) | null;
    if (!res.ok) return { ok: false, status: res.status, error: body?.error ?? { code: "INTERNAL", message: `Request failed (${res.status})` } };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "Couldn't reach the server." } };
  }
}

/** GET an admin endpoint; `reload` re-fetches without blanking what's on screen. */
export function useAdmin<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: !!path });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const r = await adminFetch<T>(path);
    if (n !== seq.current) return;
    setState(r.ok ? { data: r.data, loading: false } : { error: r.error, loading: false });
  }, [path]);
  useEffect(() => {
    // Fetch on mount and whenever the path changes; the state update happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return { ...state, reload: load };
}

/* ------------------------------------------------------------- formats */

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(v === 1 || v === 0 ? 0 : digits)}%`);
export const ms = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
export const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-IN"));

/* --------------------------------------------------------------- chips */

const STATUS_TONE: Record<SourceStatus, Tone> = { active: "success", draft: "neutral", testing: "info", paused: "warning", degraded: "warning", disabled: "neutral", do_not_use: "danger" };
export function SourceStatusChip({ status, label }: { status: SourceStatus; label: string }) {
  return <StatusPill tone={STATUS_TONE[status]} label={label} />;
}

const HEALTH_TONE: Record<HealthState, Tone> = { healthy: "success", degraded: "warning", down: "danger", no_data: "neutral" };
const HEALTH_TEXT: Record<HealthState, string> = { healthy: "Healthy", degraded: "Degraded", down: "Down", no_data: "No data yet" };
export function HealthChip({ state }: { state: HealthState | undefined }) {
  const s = state ?? "no_data";
  return <StatusPill tone={HEALTH_TONE[s]} label={HEALTH_TEXT[s]} />;
}

const OUTCOME_TONE: Record<string, Tone> = { ok: "success", empty: "neutral", needs_setup: "warning", timeout: "danger", unavailable: "danger", skipped: "neutral" };
const OUTCOME_TEXT: Record<string, string> = { ok: "Success", empty: "Empty", needs_setup: "Needs setup", timeout: "Timed out", unavailable: "Failed", skipped: "Skipped" };
export function OutcomeChip({ outcome }: { outcome: string }) {
  return <StatusPill tone={OUTCOME_TONE[outcome] ?? "neutral"} label={OUTCOME_TEXT[outcome] ?? outcome} />;
}

export function AccessBadge({ label }: { label: string }) {
  return <Badge className="rounded-md px-1.5 py-0.5 text-[11px]">{label}</Badge>;
}

/* ------------------------------------------------------------- layout */

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card padding="sm" className={cn("min-w-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card padding="sm" className="flex items-start gap-3">
      {icon && <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-brand-50 text-brand-600">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{value}</p>
        <p className="text-[12px] text-ink-3">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
      </div>
    </Card>
  );
}

/** Horizontal bars. Width is relative to the largest value shown; the value itself is printed. */
export function BarList({ rows, empty = "No data yet", max = 10 }: { rows: { key: string; count: number }[]; empty?: string; max?: number }) {
  if (!rows.length) return <p className="py-4 text-center text-[13px] text-ink-4">{empty}</p>;
  const shown = rows.slice(0, max);
  const top = Math.max(...shown.map((r) => r.count), 1);
  const rest = rows.slice(max).reduce((n, r) => n + r.count, 0);
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-[12px]">
          <span className="truncate text-ink-2" title={r.key}>
            {r.key}
          </span>
          <span className="h-2 rounded-full bg-bg-soft">
            <span className="block h-2 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (r.count / top) * 100)}%` }} />
          </span>
          <span className="tabular-nums text-ink-3">{num(r.count)}</span>
        </li>
      ))}
      {rest > 0 && <li className="text-[12px] text-ink-4">+ {num(rest)} across {rows.length - max} more</li>}
    </ul>
  );
}

/** `judged` metrics (required fields, valid URLs) go green/amber/red; descriptive ones stay neutral. */
export function Meter({ label, value, hint, judged = true }: { label: string; value: number | null; hint?: string; judged?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{pct(value, 0)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-bg-soft">{value != null && <div className={cn("h-1.5 rounded-full", !judged ? "bg-brand-500" : value >= 0.9 ? "bg-success-600" : value >= 0.6 ? "bg-warning-600" : "bg-danger-600")} style={{ width: `${Math.max(2, value * 100)}%` }} />}</div>
      {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-[16px]" />
      ))}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 border-danger-100">
      <p className="inline-flex items-center gap-2 text-[13px] text-danger-600">
        <AlertTriangle className="size-4" aria-hidden /> {error.message}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
          Retry
        </Button>
      )}
    </Card>
  );
}

export function Note({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "danger" | "success"; children: ReactNode }) {
  const cls = { neutral: "bg-bg-soft text-ink-2", warning: "bg-warning-100 text-warning-600", danger: "bg-danger-100 text-danger-600", success: "bg-success-100 text-success-600" }[tone];
  return <div className={cn("rounded-[12px] px-3 py-2 text-[12px]", cls)}>{children}</div>;
}

/**
 * Destructive action with a confirmation that says exactly what will happen (spec §74). The
 * confirm button is disabled until `confirmText` (when given) is typed.
 */
export function ConfirmAction({ label, title, body, confirmLabel, confirmText, onConfirm, variant = "danger", size = "sm" }: { label: string; title: string; body: ReactNode; confirmLabel: string; confirmText?: string; onConfirm: () => Promise<string | null>; variant?: "danger" | "outline"; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setTyped("");
    setError(null);
  };
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={title}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!!confirmText && typed !== confirmText}
              onClick={async () => {
                setBusy(true);
                const err = await onConfirm();
                setBusy(false);
                if (err) setError(err);
                else close();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-[14px] text-ink-2">
          {body}
          {confirmText && (
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span>
                Type <strong className="font-mono text-ink">{confirmText}</strong> to confirm
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-10 rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] outline-none focus:border-brand-400" autoComplete="off" />
            </label>
          )}
          {error && <Note tone="danger">{error}</Note>}
        </div>
      </Modal>
    </>
  );
}

/** A table on wide screens, stacked cards on phones (spec §75). */
export function ResponsiveTable<T>({ rows, columns, rowKey, card, empty }: { rows: T[]; columns: { header: string; cell: (r: T) => ReactNode; className?: string }[]; rowKey: (r: T) => string; card: (r: T) => ReactNode; empty: ReactNode }) {
  if (!rows.length) return <div className="py-6 text-center text-[13px] text-ink-4">{empty}</div>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-4">
              {columns.map((c) => (
                <th key={c.header} scope="col" className={cn("px-2 py-2 font-medium", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="align-middle">
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-2 py-2.5 text-ink-2", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-[14px] border border-line bg-surface p-3">
            {card(r)}
          </li>
        ))}
      </ul>
    </>
  );
}
