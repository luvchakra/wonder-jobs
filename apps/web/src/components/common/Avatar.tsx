"use client";
import { useState } from "react";
import { getClientMode } from "@/lib/mode";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui";
import { initials } from "@/lib/format";
import { useHydration } from "@/store/hydration";

/** A person's initials; with `self`, the signed-in candidate's own photo over them when they've added one. */
export function Avatar({ name, size = 36, className, self = false }: { name: string; size?: number; className?: string; self?: boolean }) {
  const version = useUIStore((s) => s.photoVersion);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  // Signed in is known only in the browser: the photo waits for hydration, so the server's HTML matches the first render.
  const ready = useHydration((h) => h.hydrated);
  const src = self && ready && failedAt !== version && getClientMode().mode === "user" ? `/api/avatar?v=${version}` : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-pink-500 font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      aria-hidden="true"
    >
      {initials(name)}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- the candidate's own small photo from our API; no photo leaves the initials
        <img src={src} alt="" onError={() => setFailedAt(version)} className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}
