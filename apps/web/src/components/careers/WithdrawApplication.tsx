"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";

/** Withdraw, behind a confirmation: it can't be undone. The token goes to this app's own server in the body. */
export function WithdrawApplication({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/careers/site/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action: "withdraw" }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status !== 200) throw new Error(res.status === 400 || res.status === 409 || res.status === 404 ? (body.error ?? "That couldn't be done.") : "That couldn't be done right now. Please try again in a few minutes.");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <p role="status" className="mt-6 text-[14px] font-medium">
        Your application is withdrawn. You&apos;ll get a confirmation email.
      </p>
    );
  return (
    <div className="mt-6 text-[14px]">
      {confirming ? (
        <div role="group" aria-labelledby="withdraw-q" className="rounded-[12px] border border-line p-4">
          <p id="withdraw-q" className="text-ink-2">
            Withdraw this application? The team stops considering you for this position. This can&apos;t be undone.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-danger-600">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={withdraw} loading={busy}>
              Withdraw application
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Withdraw
        </Button>
      )}
    </div>
  );
}
