"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/common/Input";
import { useDebounced } from "@/lib/useDebounce";
import { cn } from "@/lib/cn";

interface Place {
  name: string;
  detail: string;
  kind: "city" | "country" | "remote";
}

// One answer per typed start, kept for the visit: the same letters never ask twice.
const cache = new Map<string, Place[]>();

/**
 * A Location box that suggests real places worldwide (GeoNames, via /api/places) for the place being typed —
 * the part after the last comma, so several places can be listed. Picking one puts its name in; nothing is
 * filled in that wasn't picked or typed.
 */
export function PlaceInput({ value, onChange, onEnter, placeholder, className }: { value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string; className?: string }) {
  const parts = value.split(",");
  const typing = parts[parts.length - 1].trim();
  const q = useDebounced(typing, 150);
  const key = q.toLowerCase();
  // Answers this box has received, in state so the list re-reads when one lands (the module cache alone
  // isn't something React — or its compiler's memoisation — sees change).
  const [answers, setAnswers] = useState<Record<string, Place[]>>({});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (key.length < 2 || cache.has(key)) return;
    const ctl = new AbortController();
    fetch(`/api/places?q=${encodeURIComponent(key)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d: { places: Place[] }) => {
        cache.set(key, d.places);
        setAnswers((a) => ({ ...a, [key]: d.places }));
        setActive(-1);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [key]);
  const places = key.length >= 2 ? (answers[key] ?? cache.get(key) ?? []) : [];

  // Only what answers the words in the box now (not a slower, older answer), and not a place already picked.
  const shown = typing.length >= 2 && q === typing ? places.filter((p) => p.name.toLowerCase() !== typing.toLowerCase()) : [];
  const expanded = open && shown.length > 0;

  const pick = (p: Place) => {
    const before = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
    onChange([...before, p.name].join(", "));
    setOpen(false);
    setActive(-1);
    box.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={box}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (expanded && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % shown.length);
          } else if (expanded && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
          } else if (e.key === "Escape") setOpen(false);
          else if (e.key === "Enter") {
            if (expanded && active >= 0) {
              e.preventDefault();
              pick(shown[active]);
            } else onEnter?.();
          }
        }}
        placeholder={placeholder}
        enterKeyHint="search"
      />
      {expanded && (
        // Taps here mustn't take the focus from the box first (that would close the list before the tap lands).
        <ul id={listId} role="listbox" aria-label="Places" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-[16px] border border-line bg-surface py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          {shown.map((p, i) => (
            <li key={`${p.name}|${p.detail}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => pick(p)} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-left", i === active ? "bg-bg-soft" : "hover:bg-bg-soft")}>
              <MapPin className="size-4 shrink-0 text-ink-4" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink">{p.name}</span>
                <span className="block truncate text-[12px] font-normal text-ink-3">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
