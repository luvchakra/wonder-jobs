"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Search, Sparkles, Timer } from "lucide-react";
import { resolveWonderQuery } from "@/domain/wonder/resolve";
import { parseWonderIntent, type WonderIntent } from "@/domain/wonder/intent";
import { useNow } from "@/lib/motion";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { PRIMARY_NAV, RESOURCES_NAV, SECTION_TABS } from "@/components/navigation/nav";
import { track } from "@/lib/analytics";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Actions" | "Go to";
}

/**
 * Ask Wonder: what a typed line resolves to — read by the rules first, and by a model when the rules
 * only see a plain search (it may name one of Wonder's own actions and quote the typed words, nothing
 * else) — resolved against the candidate's own data, a job search for the words, and matching pages.
 * Shared by the top-bar palette and the Wonder tab so both answer the same way.
 */
export function useAskWonder(q: string, onGo?: () => void) {
  // The model's reading for the line as typed — only asked when the rules found no action in it.
  const [ai, setAi] = useState<{ q: string; intent: WonderIntent } | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.split(/\s+/).length < 3 || parseWonderIntent(text).type !== "search_jobs") return;
    let alive = true;
    const t = setTimeout(() => {
      fetch("/api/ai/intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { intent?: WonderIntent | null } | null) => {
          if (alive && d?.intent && d.intent.type !== "search_jobs") setAi({ q: text, intent: d.intent });
        })
        .catch(() => {});
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const router = useRouter();
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
      { id: "run", label: "Search again", hint: "Search every source for your Career Profile's role", href: "/app/jobs?refresh=1", icon: Play, group: "Actions" },
      { id: "search", label: "Jobs", hint: "Your jobs, ranked by fit with your Career Profile", href: "/app/jobs", icon: Search, group: "Actions" },
      { id: "schedule", label: "Set up a scheduled search", href: "/app/automation/scheduled/new", icon: Timer, group: "Actions" },
      ...[...PRIMARY_NAV, ...SECTION_TABS.flatMap((s) => s.items), ...RESOURCES_NAV].filter((n, i, all) => all.findIndex((x) => x.href === n.href) === i).map((n) => ({ id: n.href, label: n.label, href: n.href, icon: n.icon, group: "Go to" as const })),
    ],
    [],
  );
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const hits = commands.filter((c) => c.label.toLowerCase().includes(t) || c.hint?.toLowerCase().includes(t));
    // Ask Wonder (spec Phase 3.1/3.3): the rules' reading of what was typed, else the model's checked
    // reading (one of the same actions) — never a free-text reply — resolved against the candidate's own
    // real data. It only ever returns a concrete action it can back with real data, or null to fall
    // through to the plain job-search default below.
    const ctx = { dna, jobsOrder, jobs, matches, rejected, saved, filters: jobFilters, applications, now };
    const wonder = resolveWonderQuery(q.trim(), ctx) ?? (ai?.q === q.trim() ? resolveWonderQuery(q.trim(), ctx, ai.intent) : null);
    // Anything typed can be a job search — Wonder's global field is a search field first (spec §3).
    const search: Command = { id: "search-q", label: `Search jobs for “${q.trim()}”`, hint: "Titles, companies, skills", href: `/app/jobs?q=${encodeURIComponent(q.trim())}`, icon: Search, group: "Actions" };
    const results: Command[] = wonder ? [{ id: wonder.id, label: wonder.label, hint: wonder.hint, href: wonder.href, icon: Sparkles, group: "Actions" }, search] : [search];
    return [...results, ...hits.filter((c) => c.id !== "search")];
  }, [q, commands, dna, jobsOrder, jobs, matches, rejected, saved, jobFilters, applications, now, ai]);
  const go = (c: Command) => {
    // Only the action id is recorded — never the typed text (analytics carries no free text).
    if (c.id.startsWith("wonder-")) track("wonder_intent_submitted", { intent: c.id });
    onGo?.();
    router.push(c.href);
    if (c.id.startsWith("wonder-")) track("wonder_action_completed", { intent: c.id, action: "navigate" });
  };
  return { results: filtered, go };
}
