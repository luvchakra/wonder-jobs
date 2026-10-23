"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Input } from "@/components/common/Input";
import { useDebounced } from "@/lib/useDebounce";
import { cn } from "@/lib/cn";

interface Place {
  name: string;
  detail: string;
  kind: "city" | "country";
}

/** "Remote" is a work mode, not a place: never shown or added here, but one already in the list is kept as it was. */
const isRemote = (p: string) => /^remote$/i.test(p.trim());

// One answer per typed start, kept for the visit: the same letters never ask twice.
const cache = new Map<string, Place[]>();

/**
 * A Location box that suggests real places worldwide (GeoNames, via /api/places) as you type. A picked place
 * becomes a pill under the box (× removes it) and the box is free for the next one, so several places can
 * be listed; Enter adds what's typed as it is. Nothing is added that wasn't picked or typed.
 */
export function PlaceInput({ places: value, onChange: setPlaces, label, id, placeholder, className }: { places: string[]; onChange: (places: string[]) => void; label: string; id?: string; placeholder?: string; className?: string }) {
  const picked = value.filter((p) => !isRemote(p));
  const kept = value.filter(isRemote);
  const onChange = (list: string[]) => setPlaces([...list, ...kept]);
  const [text, setText] = useState("");
  const typing = text.trim();
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
  const has = (name: string) => picked.some((p) => p.toLowerCase() === name.toLowerCase());
  const shown = typing.length >= 2 && q === typing ? places.filter((p) => !has(p.name)) : [];
  const expanded = open && shown.length > 0;

  const add = (name: string) => {
    if (name && !isRemote(name) && !has(name)) onChange([...picked, name]);
    setText("");
    setActive(-1);
    box.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={box}
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={label}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
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
          else if (e.key === "Backspace" && !text && picked.length) onChange(picked.slice(0, -1));
          else if (e.key === "Enter") {
            e.preventDefault();
            // The highlighted place, else the top suggestion, else the words as typed.
            add(shown[active >= 0 ? active : 0]?.name ?? typing);
          }
        }}
        placeholder={placeholder}
        enterKeyHint="search"
      />
      {expanded && (
        // Taps here mustn't take the focus from the box first (that would close the list before the tap lands).
        <ul id={listId} role="listbox" aria-label="Places" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-[16px] border border-line bg-surface py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          {shown.map((p, i) => (
            <li key={`${p.name}|${p.detail}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => add(p.name)} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-left", i === active ? "bg-bg-soft" : "hover:bg-bg-soft")}>
              <MapPin className="size-4 shrink-0 text-ink-4" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink">{p.name}</span>
                <span className="block truncate text-[12px] font-normal text-ink-3">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <ul aria-label={`${label}: picked`} className="mt-2 flex flex-wrap gap-1">
          {picked.map((p) => (
            <li key={p} className="inline-flex h-8 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 pl-3 pr-1 text-[12px] font-medium text-brand-700">
              {p}
              <button type="button" aria-label={`Remove ${p}`} onClick={() => onChange(picked.filter((x) => x !== p))} className="grid size-6 place-items-center rounded-full hover:bg-brand-100">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
