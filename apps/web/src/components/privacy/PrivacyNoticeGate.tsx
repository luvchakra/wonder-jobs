"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";
import { MINIMUM_AGE, PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import { useAuthStore } from "@/store/auth";
import { signOutEverywhere } from "@/lib/auth/browser";

/**
 * Asks a signed-in candidate to acknowledge the privacy notice in force (and confirm they're an adult)
 * whenever there is no record of them accepting this version — new accounts, Google sign-ins and existing
 * accounts after a material notice change alike. The acceptance is written to `consent_records`
 * server-side; nothing is assumed from the browser. Demo mode stores nothing and is not asked.
 */
export function PrivacyNoticeGate() {
  const mode = useAuthStore((s) => s.mode);
  const userId = useAuthStore((s) => s.userId);
  const [needed, setNeeded] = useState(false);
  const [adult, setAdult] = useState(false);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set when the acceptance couldn't be recorded: the candidate has seen and accepted the notice, so a
  // storage outage must not lock them out of their own account. They're asked again on the next visit.
  const [unrecorded, setUnrecorded] = useState(false);

  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/privacy/consent", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ current: boolean }>) : null))
      .then((d) => {
        if (alive && d) setNeeded(!d.current);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);

  const accept = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/privacy/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ noticeVersion: PRIVACY_NOTICE_VERSION, accept: true, adult: true }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error);
      setNeeded(false);
    } catch (e) {
      toast.error("Your acceptance couldn't be recorded", e instanceof Error ? e.message : undefined);
      setUnrecorded(true);
    } finally {
      setBusy(false);
    }
  };

  if (!needed) return null;
  return (
    <Modal
      open
      dismissible={false}
      onClose={() => {}}
      title="Before you continue"
      description={`Our privacy notice (version ${PRIVACY_NOTICE_VERSION}) explains what WonderJobs stores, why, who processes it, how long it's kept, and your rights to access, correct, export and erase it.`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOutEverywhere(userId);
              // Full reload on purpose, as in Profile → Sign out: drop every in-memory store.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/";
            }}
          >
            Sign out
          </Button>
          {unrecorded && (
            <Button variant="outline" onClick={() => setNeeded(false)}>
              Continue for now
            </Button>
          )}
          <Button loading={busy} disabled={!adult || !read} onClick={accept}>
            {unrecorded ? "Try again" : "Accept and continue"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[14px] text-ink-2">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={read} onChange={(e) => setRead(e.target.checked)} />
          <span>
            I&apos;ve read the{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-brand-700 underline">
              privacy notice
            </Link>{" "}
            and agree to WonderJobs processing my data as it describes.
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 size-4 accent-brand-600" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I&apos;m {MINIMUM_AGE} or older.</span>
        </label>
        {unrecorded && <p className="text-[12.5px] text-warning-600">We couldn&apos;t record your acceptance just now. You can continue; we&apos;ll ask again next time.</p>}
        <p className="text-[12.5px] text-ink-3">Don&apos;t agree? Sign out — and you can delete your account any time from Profile → Your data.</p>
      </div>
    </Modal>
  );
}
