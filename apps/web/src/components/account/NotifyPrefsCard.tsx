"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/Card";
import { Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { useAuthStore } from "@/store/auth";
import { setBellChoices } from "@/store/bellChoices";
import { NOTIFY_TOPICS, hasChannel, type NotifyChannel, type NotifyPrefs, type NotifyTopic, type NudgeChannel } from "@/domain/notifications/prefs";

const CHANNELS: { id: NotifyChannel; label: string }[] = [
  { id: "bell", label: "In the bell" },
  { id: "push", label: "Push" },
  { id: "email", label: "Email" },
];

/**
 * Notifications & email → every kind of notification, each with In the bell, Push and Email where that kind can go
 * that way ("—" where it can't), inside what the platform allows (a channel it doesn't is shown off and fixed).
 * Signed-in accounts only: the choices are kept with the account.
 */
export function NotifyPrefsCard() {
  const mode = useAuthStore((s) => s.mode);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [allowed, setAllowed] = useState<Record<NotifyTopic, Record<NudgeChannel, boolean>> | null>(null);
  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/notify-prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs?: NotifyPrefs; allowed?: Record<NotifyTopic, Record<NudgeChannel, boolean>> } | null) => {
        if (!alive || !d?.prefs) return;
        setPrefs(d.prefs);
        if (d.allowed) setAllowed(d.allowed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);
  if (mode !== "user" || !prefs) return null;

  const set = async (topic: NotifyTopic, channel: NotifyChannel, on: boolean) => {
    const before = prefs;
    const next = { ...prefs, [topic]: { ...prefs[topic], [channel]: on } };
    setPrefs(next);
    setBellChoices(next);
    const r = await fetch("/api/notify-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefs: next }) }).catch(() => null);
    if (!r?.ok) {
      setPrefs(before);
      setBellChoices(before);
      toast.error("Couldn't change that", "Try again in a moment.");
    }
  };
  // The bell is always the person's own; push and email only where the platform allows them.
  const may = (t: NotifyTopic, c: NotifyChannel) => c === "bell" || (allowed?.[t]?.[c] ?? true);

  return (
    <Card className="mt-4" padding="sm">
      <div className="flex items-end gap-2 border-b border-line pb-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-ink">What you&apos;re told</h2>
        {CHANNELS.map((c) => (
          <span key={c.id} className="w-12 text-center text-[11px] font-medium leading-tight text-ink-3">
            {c.label}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-line" aria-label="Kinds of notification">
        {NOTIFY_TOPICS.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-ink">{t.label}</span>
              <span className="block text-[12px] leading-snug text-ink-3">{t.hint}</span>
            </span>
            {CHANNELS.map((c) => (
              <span key={c.id} className="flex w-12 justify-center">
                {hasChannel(t.id, c.id) ? (
                  <Switch checked={prefs[t.id][c.id] && may(t.id, c.id)} disabled={!may(t.id, c.id)} onChange={(v) => void set(t.id, c.id, v)} label={`${t.label}: ${c.label}`} />
                ) : (
                  <span className="text-[13px] text-ink-4" aria-label={`${t.label}: not sent by ${c.label.toLowerCase()}`}>
                    —
                  </span>
                )}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="pt-2 text-[12px] text-ink-3">Email goes only when a push didn&apos;t reach you. A switch you can&apos;t change is off for everyone.</p>
    </Card>
  );
}
