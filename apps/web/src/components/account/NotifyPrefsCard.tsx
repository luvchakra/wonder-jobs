"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { useAuthStore } from "@/store/auth";
import { NOTIFY_TOPICS, type NotifyChannel, type NotifyPrefs, type NotifyTopic } from "@/domain/notifications/prefs";

/** Account → Notifications & email → Notify me about: per topic, a push and an email switch (signed-in accounts). */
export function NotifyPrefsCard() {
  const mode = useAuthStore((s) => s.mode);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/notify-prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prefs?: NotifyPrefs } | null) => alive && d?.prefs && setPrefs(d.prefs))
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
    const r = await fetch("/api/notify-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefs: next }) }).catch(() => null);
    if (!r?.ok) {
      setPrefs(before);
      toast.error("Couldn't change that", "Try again in a moment.");
    }
  };
  const on = NOTIFY_TOPICS.filter((t) => prefs[t.id].push || prefs[t.id].email).length;

  return (
    <Card className="mt-4" padding="sm">
      <Fold title="Notify me about" hint={on === NOTIFY_TOPICS.length ? "Everything" : on ? `${on} of ${NOTIFY_TOPICS.length}` : "Bell only"}>
        <p className="text-[13px] text-ink-2">Everything stays in the bell. Email goes only when a push didn&apos;t reach you.</p>
        <ul className="mt-2 divide-y divide-line pb-2">
          {NOTIFY_TOPICS.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-ink">{t.label}</span>
                <span className="block text-[12px] text-ink-3">{t.hint}</span>
              </span>
              {(["push", "email"] as const).map((c) => (
                <span key={c} className="inline-flex items-center gap-2 text-[12px] text-ink-3">
                  {c === "push" ? "Push" : "Email"}
                  <Switch checked={prefs[t.id][c]} onChange={(v) => void set(t.id, c, v)} label={`${c === "push" ? "Push" : "Email"}: ${t.label}`} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      </Fold>
    </Card>
  );
}
