"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff } from "lucide-react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";

interface Support {
  ok: boolean;
  why?: string;
}

/** Browser capability doesn't change while the page is open, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};
const clientSupport = (): Support =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    ? { ok: true }
    : {
        ok: false,
        // Most often iOS Safari outside an installed PWA: a real limitation, worth saying plainly.
        why: /iphone|ipad/i.test(navigator.userAgent) ? "On iPhone and iPad, notifications work once you add WonderJobs to your Home Screen." : "This browser doesn't support web notifications.",
      };
/** The server can't know what the browser supports, and rendering nothing is the safe answer. */
const serverSupport = (): Support | null => null;

/** The VAPID key travels as base64url but `pushManager.subscribe` wants the raw 65 bytes. */
function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

interface Config {
  configured: boolean;
  publicKey: string | null;
}

/**
 * Turning browser notifications on for this device.
 *
 * Deliberately never asks for permission on load: an uninvited permission prompt is how a site gets
 * blocked for good, and a blocked browser can't be un-blocked from here. The candidate presses the
 * button, and the server sends one real notification straight away so "it's on" is something they see
 * rather than something they're told.
 */
export function PushNotifications() {
  const support = useSyncExternalStore<Support | null>(noSubscribe, clientSupport, serverSupport);
  const [config, setConfig] = useState<Config | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Asked even on a browser that can't do push: a deployment with no keys has nothing to offer
    // anyone, and shouldn't show a notifications card explaining why this browser can't have them.
    if (!support) return;
    let alive = true;
    void (async () => {
      let next: Config | null = null;
      try {
        const res = await fetch("/api/push/subscribe", { cache: "no-store" });
        next = res.ok ? ((await res.json()) as Config) : null;
      } catch {
        next = null;
      }
      const existing = next?.configured && support.ok ? await navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()) : null;
      if (!alive) return;
      setConfig(next);
      setSubscribed(Boolean(existing));
      setBlocked(support.ok && Notification.permission === "denied");
    })();
    return () => {
      alive = false;
    };
  }, [support]);

  const enable = async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBlocked(permission === "denied");
        return;
      }
      // `serviceWorker.ready` never resolves when nothing was ever registered — the case in local
      // development, where the worker is registered in production builds only. Check first.
      if (!(await navigator.serviceWorker.getRegistration())) {
        toast.error("Notifications need the deployed app", "The service worker only runs in the production build, not in local development.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(config.publicKey) }));
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) {
        // Never leave a subscription the server doesn't know about: it would receive nothing, forever.
        await sub.unsubscribe().catch(() => {});
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error("Couldn't turn notifications on", data?.error);
        return;
      }
      setSubscribed(true);
      toast.success("Notifications are on", "We've sent one to this device so you can see how it looks.");
    } catch (e) {
      toast.error("Couldn't turn notifications on", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription());
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
      toast.info("Notifications are off", "You'll still see everything in the app.");
    } finally {
      setBusy(false);
    }
  };

  // Nothing to offer on the server, before the first check, or on a deployment with no push keys.
  if (!support || !config?.configured) return null;

  return (
    <Card className="mt-4 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">{subscribed ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">Notifications on this device</p>
        {!support.ok && <p className="text-[13px] text-ink-2">{support.why}</p>}
        {support.ok && blocked && !subscribed && <p className="text-[13px] text-ink-2">This browser is blocking notifications for WonderJobs. Allow them in your browser&apos;s site settings, then come back.</p>}
        {support.ok && !blocked && !subscribed && <p className="text-[13px] text-ink-2">Get a nudge when a scheduled run finds strong matches. Everything still appears in the app either way — this is only the nudge.</p>}
        {subscribed && <p className="text-[13px] text-ink-2">On for this browser. Turn it on separately on each device you use.</p>}
        {support.ok && !blocked && !subscribed && (
          <Button size="sm" className="mt-3" loading={busy} onClick={enable} icon={<Bell className="size-4" aria-hidden />}>
            Turn on notifications
          </Button>
        )}
        {subscribed && (
          <Button size="sm" variant="outline" className="mt-3" loading={busy} onClick={disable}>
            Turn off
          </Button>
        )}
      </div>
    </Card>
  );
}
