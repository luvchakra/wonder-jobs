"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calendar, Play, Search, Sparkles, Timer } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/common/Input";
import { resolveWonderQuery } from "@/domain/wonder/resolve";
import { useNow } from "@/lib/motion";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { CAREER_NAV, PRIMARY_NAV, RESOURCES_NAV, WONDER_NAV } from "./nav";
import { track } from "@/lib/analytics";
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
  const dna = useCareerStore((s) => s.dna);
  const jobsOrder = useJobsStore((s) => s.order);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const rejected = useJobsStore((s) => s.rejected);
  const saved = useJobsStore((s) => s.saved);
  const jobFilters = useJobsStore((s) => s.filters);
  const applications = useApplicationsStore((s) => s.applications);
  const now = useNow();
  const commands = useMemo<Command[]>(
    () => [
      { id: "run", label: "Find opportunities", hint: "Tell Wonder what you're looking for", href: "/app/runs/new", icon: Play, group: "Actions" },
      { id: "search", label: "Search jobs", hint: "Jobs matching your Career Profile", href: "/app/jobs", icon: Search, group: "Actions" },
      { id: "schedule", label: "Set up a scheduled search", href: "/app/automation/scheduled/new", icon: Timer, group: "Actions" },
      ...[...PRIMARY_NAV, ...WONDER_NAV, ...CAREER_NAV, ...RESOURCES_NAV, { href: "/app/settings/ai", label: "AI provider & keys", icon: Sparkles }, { href: "/app/calendar", label: "Calendar", icon: Calendar }].map((n) => ({ id: n.href, label: n.label, href: n.href, icon: n.icon, group: "Go to" as const })),
    ],
    [],
  );
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const hits = commands.filter((c) => c.label.toLowerCase().includes(t) || c.hint?.toLowerCase().includes(t));
    // Ask Wonder (spec Phase 3.1/3.3): a deterministic, pattern-based reading of what was typed —
    // never a model call or free-text reply — resolved against the candidate's own real data. It
    // only ever returns a concrete action it can back with real data, or null to fall through to
    // the plain job-search default below.
    const wonder = resolveWonderQuery(q.trim(), { dna, jobsOrder, jobs, matches, rejected, saved, filters: jobFilters, applications, now });
    // Anything typed can be a job search — Wonder's global field is a search field first (spec §3).
    const search: Command = { id: "search-q", label: `Search jobs for “${q.trim()}”`, hint: "Titles, companies, skills", href: `/app/jobs?q=${encodeURIComponent(q.trim())}`, icon: Search, group: "Actions" };
    const results: Command[] = wonder ? [{ id: wonder.id, label: wonder.label, hint: wonder.hint, href: wonder.href, icon: Sparkles, group: "Actions" }, search] : [search];
    return [...results, ...hits.filter((c) => c.id !== "search")];
  }, [q, commands, dna, jobsOrder, jobs, matches, rejected, saved, jobFilters, applications, now]);
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
    // Only the action id is recorded — never the typed text (analytics carries no free text).
    if (c.id.startsWith("wonder-")) track("wonder_intent_submitted", { intent: c.id });
    close();
    router.push(c.href);
    if (c.id.startsWith("wonder-")) track("wonder_action_completed", { intent: c.id, action: "navigate" });
  };
  return (
    <Modal open={open} onClose={close} title="Ask Wonder" description="Search jobs, ask a real question about your search or applications, or jump to a page.">
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
