"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, type ButtonProps } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";
import { resolveCapability, type Capability } from "@/domain/automation/policy";
import { useAutomationStore } from "@/store/automation";

/** The server answers 409 with this when a setting is Ask me and the person hasn't yet checked what goes. */
export const needsConfirm = (e: unknown) => (e as { status?: number }).status === 409 && /then press Send/.test((e as Error).message ?? "");

/**
 * One press that reaches another person, gated like every one: it runs at once when the setting is Automatic, shows what
 * goes first when it is Ask me, and is off when it is Off (resolveCapability; the server checks it again and fails
 * closed, answering 409 when the browser's copy said Automatic but the saved one says Ask me). Shared by every module
 * whose presses reach someone (Co-founders, Buy, Sell & Rent): `settings` is the module's own You page to turn it on.
 */
export function Act({ capability, label, review, run, done, settings, variant = "primary", size, full, icon }: { capability: Capability; label: string; /** What goes, in a sentence or two: shown before sending when the setting is Ask me. */ review: React.ReactNode; run: (confirmed: boolean) => Promise<unknown>; done?: string; settings: { href: string; label: string }; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; full?: boolean; icon?: React.ReactNode }) {
  const policy = useAutomationStore((s) => s.policy);
  const level = useAutomationStore((s) => s.defaultLevel);
  const decision = resolveCapability(capability, policy, level);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (confirmed: boolean) => {
    setBusy(true);
    try {
      await run(confirmed);
      setReviewing(false);
      if (done) toast.success(done);
    } catch (e) {
      if (needsConfirm(e)) setReviewing(true);
      else toast.error("Couldn't do that", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (decision === "skip")
    return (
      <p className="text-[13px] text-ink-3">
        This is turned off. Turn it on in <Link href={settings.href} className="font-medium text-brand-600 hover:underline">{settings.label}</Link>.
      </p>
    );
  if (reviewing)
    return (
      <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface-2 p-3" role="group" aria-label={`Check before you ${label.toLowerCase()}`}>
        <div className="text-[13px] text-ink-2">{review}</div>
        <div className="flex gap-2">
          <Button size="sm" loading={busy} onClick={() => go(true)}>
            Send
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReviewing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  return (
    <Button variant={variant} size={size} full={full} icon={icon} loading={busy} onClick={() => (decision === "ask" ? setReviewing(true) : go(false))}>
      {label}
    </Button>
  );
}
