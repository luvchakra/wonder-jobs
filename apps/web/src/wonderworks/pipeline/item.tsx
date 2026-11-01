"use client";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/common/Card";
import { CompanyLogo } from "@/wonderworks/brand/CompanyLogo";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { cn } from "@/lib/cn";

/**
 * A Pipeline item's own page, shared by every WonderWorks module (taken from Jobs' application page,
 * app/app/applications/[id]): the header with Back and the status badge, then `ItemMain` (what it is, its timeline)
 * and `ItemAside` (status, its action, folds). A module brings only what goes in each.
 */
export function ItemPage({ back, title, badge, children }: { back: { href: string; label: string }; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={back} title={title} actions={badge} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">{children}</div>
    </div>
  );
}

/** The item page's main column: what it is, then its timeline. */
export function ItemMain({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4">{children}</div>;
}

/** The item page's aside: its status and the one action it needs, then folds. */
export function ItemAside({ children }: { children: React.ReactNode }) {
  return <aside className="flex flex-col gap-4">{children}</aside>;
}

/** The item's head: the logo, the company and its facts, one line each; `children` (links, actions) go under them. */
export function ItemHead({ company, domain, lines, children }: { company: string; domain?: string; lines: React.ReactNode[]; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <CompanyLogo name={company} domain={domain} logo size={52} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold text-ink">{company}</p>
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className="text-[13px] text-ink-3">
            {l}
          </p>
        ))}
        {children}
      </div>
    </div>
  );
}

/** A titled card on the item's page (Timeline, …). */
export function ItemSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </Card>
  );
}

/**
 * The module's Pipeline stages, the one the item is in lit and each one it actually passed through ticked. For an item
 * someone else moves on (a company, a host), so they read rather than toggle.
 */
export function StageSteps({ stages, current, reached, currentLabel }: { stages: { id: string; label: string }[]; current: string; reached: Set<string>; currentLabel?: string }) {
  const at = stages.findIndex((s) => s.id === current);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-ink-2">Status</p>
      <ol aria-label="Stages" className="grid grid-cols-2 gap-1.5">
        {stages.map((s, i) => {
          const passed = i < at && reached.has(s.id);
          return (
            <li key={s.id} aria-current={i === at ? "step" : undefined} className={cn("flex min-h-[48px] items-center justify-center gap-1.5 rounded-[12px] border px-1 text-center text-[12px] font-medium", i === at ? "border-brand-400 bg-brand-50 text-brand-700" : passed ? "border-line bg-surface text-ink-2" : "border-line bg-surface text-ink-4")}>
              {passed && <CheckCircle2 className="size-3.5 shrink-0 text-success-600" aria-hidden />}
              {i === at && currentLabel ? currentLabel : s.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
