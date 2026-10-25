"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshFromServer } from "@/store/remoteStorage";
import { useCareerStore } from "@/store/career";
import { getClientMode } from "@/lib/mode";
import { toast } from "@/components/feedback/Toast";
import { cn } from "@/lib/cn";

/**
 * Refresh (This week, Insights): fetches your saved data from the server again — what another device or the
 * server's reminders changed — and the page recounts from it. Never a search. Opening a page doesn't do this.
 */
export function RefreshButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    const ok = await refreshFromServer();
    if (getClientMode().mode === "user") {
      await fetch("/api/inbox", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((inbox) => inbox && useCareerStore.getState().mergeInbox(inbox))
        .catch(() => {});
    }
    setBusy(false);
    if (!ok) toast.error("Couldn't refresh", "Showing what's on this device. Try again in a moment.");
  };
  return (
    <button type="button" onClick={() => void refresh()} disabled={busy} aria-busy={busy} aria-label="Refresh" title="Refresh" className={cn("grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg-soft disabled:opacity-60", className)}>
      <RefreshCw className={cn("size-4", busy && "wj-animate-spin")} aria-hidden />
    </button>
  );
}
