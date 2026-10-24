"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Two options in one pill, with a thumb that slides between them. Tap either side, drag or swipe the
 * thumb across, or use the arrow keys. It is a radio group to assistive technology.
 */
export function SlideToggle<T extends string>({ value, options, onChange, label, className }: { value: T; options: readonly [{ value: T; label: string }, { value: T; label: string }]; onChange: (v: T) => void; label: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  // Set when a drag ends: the click the browser sends after it must not undo what the drag chose.
  const dragged = useRef(false);
  // While dragging: how far the thumb is across the track, 0 (first) to 1 (second).
  const [drag, setDrag] = useState<number | null>(null);
  const second = value === options[1].value;
  const at = drag ?? (second ? 1 : 0);

  const pick = (v: T) => {
    if (v !== value) onChange(v);
  };
  const half = () => (track.current ? track.current.clientWidth / 2 : 1);

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      className={cn("relative grid touch-pan-y select-none grid-cols-2 rounded-full border border-line bg-surface p-0.5", className)}
      onPointerDown={(e) => {
        dragged.current = false;
        start.current = { x: e.clientX, moved: false };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (!s.moved && Math.abs(dx) < 6) return;
        if (!s.moved) {
          s.moved = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        setDrag(Math.min(1, Math.max(0, (second ? 1 : 0) + dx / half())));
      }}
      onPointerUp={() => {
        const s = start.current;
        start.current = null;
        if (s?.moved && drag !== null) {
          dragged.current = true;
          pick(drag >= 0.5 ? options[1].value : options[0].value);
        }
        setDrag(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") pick(options[1].value);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") pick(options[0].value);
        else return;
        e.preventDefault();
        (track.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0])?.focus();
      }}
    >
      <span
        aria-hidden
        className={cn("wj-gradient-bg pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full shadow-brand", drag === null && "transition-transform duration-200 ease-out motion-reduce:transition-none")}
        style={{ transform: `translateX(${at * 100}%)` }}
      />
      {options.map((o, i) => {
        const active = o.value === value;
        const lit = drag === null ? active : i === (at >= 0.5 ? 1 : 0);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              pick(o.value);
            }}
            className={cn("relative z-10 min-h-9 rounded-full px-4 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", lit ? "text-white" : "text-ink-2 hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
