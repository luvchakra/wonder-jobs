"use client";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCareerStore } from "@/store/career";
import { stripHeadlineLabel, stripSelfReference } from "./headline";
import { Avatar } from "@/components/common/Avatar";

/** One row on You: an icon, what it is, its current value, and where it leads. */
export interface YouRow {
  href: string;
  label: string;
  value: string;
  icon: LucideIcon;
}

/** You's rows, in one rounded list. */
export function YouRows({ rows }: { rows: YouRow[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.href}>
          <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 text-[14px] hover:bg-surface-2">
            <r.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="flex-1 text-ink">{r.label}</span>
            <span className="max-w-[45%] truncate text-[13px] text-ink-3">{r.value}</span>
            <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** You, the same in every module: who Wonder works for (the Career Profile, at the top), then the module's own rows. Account, plan, data and Automation are in the avatar menu. */
export function YouOverview({ rows = [], module }: { /** The module's rows, under the Career Profile (WonderJobs: Ask Wonder, Skill Up, My Resume…). */ rows?: YouRow[]; /** A module's own section (its persona), shown under the Career Profile, in the same style. */ module?: { label: string; rows: YouRow[] } } = {}) {
  const dna = useCareerStore((s) => s.dna);
  const email = useAuthStore((s) => s.email);
  const name = dna.name || email?.split("@")[0] || "You";
  const headline = stripHeadlineLabel(dna.headline);
  // The headline says what they do; failing that, the goal without its lead-in ("Find senior product roles…" → "senior product roles…").
  const goal = stripSelfReference(dna.careerGoal.trim()).replace(/^(?:find(?:\s+me)?|looking\s+for|search(?:\s+for)?|i\s+want)\s+/i, "");
  const wants = headline || goal;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/career-dna" className="mb-4 flex items-center gap-3 rounded-[16px] border border-line bg-surface p-4 hover:bg-surface-2">
        <Avatar name={name} size={48} self />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold text-ink">{name}</span>
          <span className="block truncate text-[13px] text-ink-3">{headline || (wants ? `Looking for ${wants}` : "Add your headline")}</span>
          <span className="mt-0.5 block text-[12px] font-medium text-brand-600">Career Profile</span>
        </span>
        <ChevronRight className="size-4 text-ink-4" aria-hidden />
      </Link>
      {module && (
        <section aria-label={module.label} className="mb-4">
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-3">{module.label}</h2>
          <YouRows rows={module.rows} />
        </section>
      )}
      {rows.length > 0 && <YouRows rows={rows} />}
    </div>
  );
}
