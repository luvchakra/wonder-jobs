"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";
import { useAuthStore } from "@/store/auth";
import { relativeTime } from "@/lib/format";

interface DigestSetting {
  enabled: boolean;
  lastSentAt: string | null;
  last: { at: string; sent: boolean; reason?: string } | null;
}

/** The activity email: on by default for signed-in accounts, one switch, and "email me one now" to see it. */
export function DigestEmailCard() {
  const mode = useAuthStore((s) => s.mode);
  const [s, setS] = useState<DigestSetting | null>(null);
  const [busy, setBusy] = useState<"toggle" | "send" | null>(null);
  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/digest", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DigestSetting | null) => {
        if (alive && d) setS(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);
  if (mode !== "user" || !s) return null;

  const toggle = async () => {
    setBusy("toggle");
    const r = await fetch("/api/digest", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !s.enabled }) }).catch(() => null);
    if (r?.ok) setS(await r.json());
    else toast.error("Couldn't change that", "Try again in a moment.");
    setBusy(null);
  };
  const sendNow = async () => {
    setBusy("send");
    const r = await fetch("/api/digest/send", { method: "POST" }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { sent?: boolean; reason?: string } | null;
    if (d?.sent) toast.success("Sent", "Check your inbox for your WonderJobs update.");
    else toast.error("Not sent", d?.reason ?? "Try again in a moment.");
    setBusy(null);
  };

  return (
    <Card className="mt-4" padding="sm">
      <Fold title="Activity email" hint={s.enabled ? `On${s.lastSentAt ? ` · last sent ${relativeTime(s.lastSentAt)}` : ""}` : "Off"}>
        <p className="text-[13px] text-ink-2">A short email when there&apos;s been activity, at most once a day: heads up, what&apos;s going well, what to improve and suggestions — from your own account.</p>
        <div className="mt-3 flex flex-wrap gap-2 pb-2">
          <Button size="sm" variant={s.enabled ? "outline" : "primary"} loading={busy === "toggle"} onClick={toggle}>
            {s.enabled ? "Turn off" : "Turn on"}
          </Button>
          <Button size="sm" variant="ghost" loading={busy === "send"} onClick={sendNow}>
            Email me one now
          </Button>
        </div>
      </Fold>
    </Card>
  );
}
