"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Play, Search, Sparkles, Timer } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/common/Input";
import { AUTOMATION_NAV, PRIMARY_NAV, RESOURCES_NAV } from "./nav";
import { cn } from "@/lib/cn";

interface Command {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Actions" | "Go to";
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useMemo<Command[]>(
    () => [
      { id: "run", label: "Run Wonder", hint: "Find, analyze, prepare, track", href: "/app/runs/new", icon: Play, group: "Actions" },
      { id: "search", label: "Search jobs", hint: "Jobs matching your Career DNA", href: "/app/jobs", icon: Search, group: "Actions" },
      { id: "schedule", label: "Create a scheduled run", href: "/app/automation/scheduled/new", icon: Timer, group: "Actions" },
      ...[...PRIMARY_NAV, ...AUTOMATION_NAV, ...RESOURCES_NAV, { href: "/app/settings/ai", label: "AI provider & keys", icon: Sparkles }].map((n) => ({ id: n.href, label: n.label, href: n.href, icon: n.icon, group: "Go to" as const })),
    ],
    [],
  );
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const hits = commands.filter((c) => c.label.toLowerCase().includes(t) || c.hint?.toLowerCase().includes(t));
    // Anything typed can be a job search — Wonder's global field is a search field first (spec §3).
    const search: Command = { id: "search-q", label: `Search jobs for “${q.trim()}”`, hint: "Titles, companies, skills", href: `/app/jobs?q=${encodeURIComponent(q.trim())}`, icon: Search, group: "Actions" };
    return [search, ...hits.filter((c) => c.id !== "search")];
  }, [q, commands]);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);
  const close = () => {
    setQ("");
    setIdx(0);
    onClose();
  };
  const go = (c: Command) => {
    close();
    router.push(c.href);
  };
  return (
    <Modal open={open} onClose={close} title="Ask Wonder" description="Jump to a page or start something. Type to filter.">
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
          } else if (e.key === "Enter" && filtered[idx]) go(filtered[idx]);
        }}
        placeholder="Search jobs, run Wonder, open a page…"
        aria-label="Command"
        role="combobox"
        aria-expanded="true"
        aria-controls="wj-cmd-list"
        aria-activedescendant={filtered[idx] ? `cmd-${filtered[idx].id}` : undefined}
      />
      <ul id="wj-cmd-list" role="listbox" className="mt-3 max-h-80 overflow-y-auto">
        {(["Actions", "Go to"] as const).map((group) => {
          const items = filtered.filter((c) => c.group === group);
          if (!items.length) return null;
          return (
            <li key={group}>
              <p className="wj-eyebrow px-3 pb-1 pt-3 text-[11px]">{group}</p>
              <ul>
                {items.map((c) => {
                  const i = filtered.indexOf(c);
                  const Icon = c.icon;
                  return (
                    <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === idx}>
                      <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => go(c)} className={cn("flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm", i === idx ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-bg-soft")}>
                        <Icon className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1">
                          <span className="font-medium text-ink">{c.label}</span>
                          {c.hint && <span className="ml-2 text-xs text-ink-3">{c.hint}</span>}
                        </span>
                        <ArrowRight className="size-4 text-ink-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
