"use client";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";

/** Mic toggle for a dictated field. `label` names the field, e.g. "career goal". */
export function DictateButton({ listening, onClick, label, className }: { listening: boolean; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={listening}
      aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`}
      title={listening ? "Stop dictating" : "Dictate with your voice"}
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
        listening ? "bg-danger-100 text-danger-600" : "text-ink-3 hover:bg-bg-soft hover:text-ink",
        className,
      )}
    >
      {listening ? <Square className="size-3.5 fill-current" aria-hidden /> : <Mic className="size-4" aria-hidden />}
      {listening && <span className="wj-animate-pulse-dot absolute inset-0 rounded-full ring-2 ring-danger-600/50" aria-hidden />}
    </button>
  );
}
