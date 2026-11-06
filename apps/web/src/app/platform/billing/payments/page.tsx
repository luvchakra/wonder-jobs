"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, Copy, ExternalLink } from "lucide-react";
import type { PaymentsSetup } from "@/server/billing/paymentsAdmin";
import { StatusPill } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, Note, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

const API = "/api/billing/admin/payments";
const DASHBOARD = "https://dashboard.razorpay.com/app";

/**
 * Payments: connect Razorpay in three steps (keys, webhook, prices) and see when candidates can pay. Secrets are entered
 * here, checked with Razorpay, stored encrypted and only ever shown masked.
 */
export default function BillingPaymentsPage() {
  const { data, error, reload } = useAdmin<PaymentsSetup>(API);
  return (
    <>
      <PageTitle title="Payments" subtitle="Connect Razorpay so candidates can pay for Pro and Max with UPI, cards or net banking, without leaving WonderWorks." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={3} />}
      {data && <Setup data={data} onChanged={reload} />}
    </>
  );
}

function Step({ done, n, title, children, action }: { done: boolean; n: number; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {done ? <CheckCircle2 className="size-5 text-success-600" aria-hidden /> : <Circle className="size-5 text-ink-4" aria-hidden />}
          <span>
            {n}. {title}
          </span>
        </span>
      }
      action={action}
    >
      {children}
    </Panel>
  );
}

function Setup({ data, onChanged }: { data: PaymentsSetup; onChanged: () => void }) {
  const key = (n: string) => data.keys.find((k) => k.name === n)!;
  const keysDone = data.connection.state === "connected";
  const pro = data.prices.find((p) => p.plan === "pro");
  return (
    <div className="flex flex-col gap-4">
      {data.live ? (
        <Note tone="success">
          Payments are live{data.mode === "test" ? " in Razorpay's test mode: use Razorpay's test cards or UPI, no real money moves" : ""}. Candidates see Upgrade on You → Plan &amp; billing, and testing plans are now for admins only.
        </Note>
      ) : (
        <Note tone="warning">Payments aren&apos;t live yet: finish the steps below. Until then candidates can try plans without paying.</Note>
      )}

      <Step
        n={1}
        done={keysDone}
        title="API keys"
        action={data.mode && <StatusPill tone={data.mode === "live" ? "success" : "warning"} label={data.mode === "live" ? "Live mode" : "Test mode"} />}
      >
        <KeysForm data={data} onChanged={onChanged} />
        {data.connection.state === "refused" && <p className="mt-2 text-[12.5px] text-danger-600">{data.connection.reason}. Enter both again.</p>}
        {data.connection.state === "unavailable" && <p className="mt-2 text-[12.5px] text-warning-600">{data.connection.reason}; the keys are kept.</p>}
        <p className="mt-2 text-[12px] text-ink-3">
          In Razorpay: Account &amp; Settings → API keys → Generate key.{" "}
          <a className="inline-flex items-center gap-0.5 text-brand-600 hover:underline" href={`${DASHBOARD}/website-app-settings/api-keys`} target="_blank" rel="noreferrer">
            Open Razorpay <ExternalLink className="size-3" aria-hidden />
          </a>
          {key("RAZORPAY_KEY_ID").from === "environment" && " · The Key ID is set in the deployment, which wins over this page."}
        </p>
      </Step>

      <Step n={2} done={data.webhook.secretSet} title="Webhook">
        <p className="text-[13px] text-ink-2">So renewals, failed payments and cancellations reach WonderWorks. In Razorpay: Account &amp; Settings → Webhooks → Add new webhook, then:</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>
            Webhook URL: <CopyText text={data.webhook.url} />
          </li>
          <li>Secret: the one below (generate one, copy it into Razorpay, then save it here).</li>
          <li>
            Active events: the {data.webhook.events.length} subscription events{" "}
            <span className="text-ink-3">({data.webhook.events.map((e) => e.replace("subscription.", "")).join(", ")})</span>.
          </li>
        </ol>
        <WebhookForm set={data.webhook.secretSet} fromEnv={key("RAZORPAY_WEBHOOK_SECRET").from === "environment"} onChanged={onChanged} />
        <a className="mt-2 inline-flex items-center gap-0.5 text-[12px] text-brand-600 hover:underline" href={`${DASHBOARD}/website-app-settings/webhooks`} target="_blank" rel="noreferrer">
          Open Razorpay webhooks <ExternalLink className="size-3" aria-hidden />
        </a>
      </Step>

      <Step n={3} done={!!pro?.set} title="Prices">
        <ul className="space-y-1 text-[13px] text-ink-2">
          {data.prices.map((p) => (
            <li key={p.plan}>
              <span className="font-medium text-ink">{p.label}</span> {p.set ? "has a Razorpay price" : p.plan === "pro" ? "needs a Razorpay price before anyone can pay" : "has no Razorpay price yet (optional)"}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-ink-3">
          {keysDone ? "Set each plan's monthly price on Prices; it's created in Razorpay for you." : "Connect the keys first; then set each plan's monthly price on Prices."}
          {data.mode && " Switching between test and live keys needs the prices set again: Razorpay keeps them apart."}
        </p>
        <Link href="/platform/billing/prices" className="mt-2 inline-block">
          <Button size="sm" variant="outline" disabled={!keysDone}>
            Go to Prices
          </Button>
        </Link>
      </Step>

      <Panel title="Also in Billing">
        <ul className="space-y-1 text-[13px] text-ink-2">
          <li>
            <Link className="text-brand-600 hover:underline" href="/platform/billing/plans">Plans &amp; features</Link>: what Free, Pro and Max allow.
          </li>
          <li>
            <Link className="text-brand-600 hover:underline" href="/platform/billing/discounts">Discounts</Link>: Razorpay offers are made in Razorpay&apos;s dashboard (Offers) and apply in its checkout.
          </li>
          <li>
            <Link className="text-brand-600 hover:underline" href="/platform/billing/history">History</Link>: every key, price and plan change, with who made it.
          </li>
        </ul>
        {(data.keys.some((k) => k.from === "admin") || keysDone) && <Disconnect onChanged={onChanged} />}
      </Panel>
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <code className="truncate rounded bg-bg-soft px-1.5 py-0.5 text-[12px] text-ink">{text}</code>
      <button
        type="button"
        aria-label="Copy"
        className="rounded p-1 text-ink-3 hover:bg-bg-soft hover:text-ink"
        onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}
      >
        <Copy className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

async function save(body: Record<string, string>, onChanged: () => void, done: string): Promise<string | null> {
  const r = await adminFetch<PaymentsSetup>(API, { method: "PUT", body: JSON.stringify(body) });
  if (!r.ok) return r.error.message;
  toast.success(done);
  onChanged();
  return null;
}

function KeysForm({ data, onChanged }: { data: PaymentsSetup; onChanged: () => void }) {
  const id = data.keys.find((k) => k.name === "RAZORPAY_KEY_ID")!;
  const secret = data.keys.find((k) => k.name === "RAZORPAY_KEY_SECRET")!;
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = data.connection.state === "connected";
  const [editing, setEditing] = useState(!connected);
  if (!editing)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
        <span>
          Connected with <code className="text-ink">{id.shown}</code> · secret {secret.shown}
        </span>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={id.from === "environment" && secret.from === "environment"}>
          Replace keys
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const body: Record<string, string> = {};
        if (keyId.trim()) body.keyId = keyId.trim();
        if (keySecret.trim()) body.keySecret = keySecret.trim();
        const m = await save(body, onChanged, "Razorpay connected — the keys work");
        setBusy(false);
        if (m) return setErr(m);
        setKeyId("");
        setKeySecret("");
        setEditing(false);
      }}
    >
      <Field label="Key ID" htmlFor="rzp-key-id">
        <Input id="rzp-key-id" autoComplete="off" spellCheck={false} placeholder={id.set ? id.shown : "rzp_live_…"} value={keyId} onChange={(e) => setKeyId(e.target.value)} />
      </Field>
      <Field label="Key secret" htmlFor="rzp-key-secret">
        <Input id="rzp-key-secret" type="password" autoComplete="new-password" placeholder={secret.set ? secret.shown : "Shown once in Razorpay"} value={keySecret} onChange={(e) => setKeySecret(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!keyId.trim() && !keySecret.trim()}>
          Check &amp; save
        </Button>
        {connected && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
      {err && <p className="text-[12.5px] text-danger-600 sm:col-span-3">{err}</p>}
    </form>
  );
}

function randomSecret(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function WebhookForm({ set, fromEnv, onChanged }: { set: boolean; fromEnv: boolean; onChanged: () => void }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (fromEnv) return <p className="mt-3 text-[12.5px] text-ink-3">The webhook secret is set in the deployment.</p>;
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const m = await save({ webhookSecret: secret.trim() }, onChanged, "Webhook secret saved");
        setBusy(false);
        if (m) return setErr(m);
        setSecret("");
      }}
    >
      <Field label={set ? "Webhook secret (saved; enter a new one to replace it)" : "Webhook secret"} htmlFor="rzp-webhook">
        <div className="flex gap-2">
          <Input id="rzp-webhook" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={set ? "••••••••" : "Generate or paste"} />
          <Button type="button" variant="outline" onClick={() => setSecret(randomSecret())}>
            Generate
          </Button>
          {secret && <CopyButton text={secret} />}
        </div>
      </Field>
      <Button type="submit" loading={busy} disabled={secret.trim().length < 8}>
        Save secret
      </Button>
      {err && <p className="text-[12.5px] text-danger-600 sm:col-span-2">{err}</p>}
    </form>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button type="button" variant="ghost" aria-label="Copy secret" onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Copied — paste it into Razorpay"), () => toast.error("Couldn't copy"))} icon={<Copy className="size-4" aria-hidden />}>
      Copy
    </Button>
  );
}

function Disconnect({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="mt-3 text-danger-600" onClick={() => setOpen(true)}>
        Disconnect Razorpay
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Disconnect Razorpay?"
        description="Removes the keys entered here. New checkouts stop and renewal notices can't be confirmed until it's connected again. Existing subscriptions keep running at Razorpay."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep connected
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await adminFetch<PaymentsSetup>(API, { method: "DELETE", body: "{}" });
                setBusy(false);
                if (!r.ok) return toast.error("Couldn't disconnect", r.error.message);
                toast.success("Razorpay disconnected");
                setOpen(false);
                onChanged();
              }}
            >
              Disconnect
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </>
  );
}
