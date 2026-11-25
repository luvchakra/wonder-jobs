"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { rememberOpened } from "@/wonderworks/store";

/**
 * Opens a listing a member found in a post on its module's own page, with everything that page offers (Save, RSVP,
 * Apply…) (owner, 2026-11-23: "on click take user to the details page of this entry directly"). The listing is read
 * once and kept for this visit; if it can't be had, the module's Find opens instead.
 */
export function OpenListing({ kind, id, label }: { kind: string; id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const page = `/app/m/${kind}/listing/${encodeURIComponent(id)}`;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/network/listing?module=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
          const data = (await res.json().catch(() => ({}))) as { listing?: { id: string } | null };
          if (res.ok && data.listing) {
            rememberOpened(data.listing);
            router.push(page);
            return;
          }
        } catch {
          // Fall through to the module's Find.
        }
        router.push(`/app/m/${kind}`);
      }}
      className="wj-gradient-bg wj-press inline-flex h-12 items-center justify-center gap-2 rounded-[12px] px-6 text-[15px] font-semibold text-white shadow-brand hover:brightness-105 disabled:opacity-70"
    >
      {label} {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
    </button>
  );
}
