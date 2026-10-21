"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";

/** Withdrawing can't be undone; the company is told and nothing more happens to the application. */
export function HostedWithdraw({ slug, token }: { slug: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/hosted/${encodeURIComponent(slug)}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action: "withdraw" }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Your application couldn't be withdrawn. Try again later.");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (done) return <p role="status" className="mt-6 text-[14px] font-medium">Your application is withdrawn. You&apos;ll get a confirmation email.</p>;
  return (
    <details className="mt-6 text-[14px]">
      <summary className="min-h-10 cursor-pointer py-2 text-ink-3 hover:text-ink">Withdraw my application</summary>
      <p className="text-ink-3">The company will stop considering you for this position. This can&apos;t be undone, but you can apply again for other roles.</p>
      {error && (
        <p role="alert" className="mt-2 text-danger-600">
          {error}
        </p>
      )}
      <Button className="mt-3" size="sm" variant="danger" onClick={withdraw} loading={busy}>
        Withdraw application
      </Button>
    </details>
  );
}
