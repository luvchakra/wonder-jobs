"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/common/Input";
import { useAskWonder } from "@/lib/useAskWonder";
import { cn } from "@/lib/cn";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = () => {
    setQ("");
    setIdx(0);
    onClose();
  };
  const { results: filtered, go } = useAskWonder(q, close);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);
  return (
    <Modal open={open} onClose={close} title="Ask Wonder" description="Search jobs, ask about your search or applications, or jump to a page." placement="top">
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(filtered.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && filtered[idx]) {
            // Without this the same keypress lands on the trigger button that regains focus when the
            // dialog closes, and reopens the palette.
            e.preventDefault();
            go(filtered[idx]);
          }
        }}
        placeholder="e.g. “What should I focus on today?” or “Search again with Director roles”"
        aria-label="Command"
        role="combobox"
        aria-expanded="true"
        aria-controls="wj-cmd-list"
        aria-activedescendant={filtered[idx] ? `cmd-${filtered[idx].id}` : undefined}
      />
      {/* A listbox of grouped options, driven from the combobox (arrow keys + Enter): options are
          the clickable rows themselves — no nested buttons or bare list items, which assistive tech
          can't reconcile with the listbox role. */}
      <div id="wj-cmd-list" role="listbox" aria-label="Results" className="mt-3 max-h-[45dvh] overflow-y-auto sm:max-h-80">
        {(["Actions", "Go to"] as const).map((group) => {
          const items = filtered.filter((c) => c.group === group);
          if (!items.length) return null;
          return (
            <div key={group} role="group" aria-labelledby={`wj-cmd-group-${group}`}>
              <p id={`wj-cmd-group-${group}`} className="wj-eyebrow px-3 pb-1 pt-3 text-[11px]">
                {group}
              </p>
              {items.map((c) => {
                const i = filtered.indexOf(c);
                const Icon = c.icon;
                const active = i === idx;
                return (
                  <div key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={active} onMouseEnter={() => setIdx(i)} onClick={() => go(c)} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm", active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-bg-soft")}>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">
                      <span className="font-medium text-ink">{c.label}</span>
                      {c.hint && <span className={cn("ml-2 text-xs", active ? "text-ink-2" : "text-ink-3")}>{c.hint}</span>}
                    </span>
                    <ArrowRight className="size-4 text-ink-4" aria-hidden />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
