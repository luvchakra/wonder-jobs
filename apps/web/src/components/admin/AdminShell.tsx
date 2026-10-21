"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Activity, Building2, ChevronDown, CreditCard, Database, LayoutDashboard, Menu, Send, Settings, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AdminLink {
  href: string;
  label: string;
}
export interface AdminMenu {
  id: string;
  label: string;
  icon: LucideIcon;
  links: AdminLink[];
}

const LAKE = "/platform/jobs-lake";

/** Every platform admin page, grouped. A menu with one page is a plain link; the rest open into their pages. */
export const ADMIN_MENUS: AdminMenu[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, links: [{ href: LAKE, label: "Overview" }] },
  {
    id: "jobs",
    label: "Jobs data",
    icon: ShieldCheck,
    links: [
      { href: `${LAKE}/insights`, label: "Insights" },
      { href: `${LAKE}/jobs`, label: "Jobs" },
      { href: `${LAKE}/quality`, label: "Data quality" },
      { href: `${LAKE}/playground`, label: "Search playground" },
    ],
  },
  {
    id: "sources",
    label: "Sources",
    icon: Database,
    links: [
      { href: `${LAKE}/sources`, label: "All sources" },
      { href: `${LAKE}/add`, label: "Add a source" },
      { href: `${LAKE}/credentials`, label: "Credentials" },
      { href: `${LAKE}/protocols`, label: "Protocols" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Activity,
    links: [
      { href: `${LAKE}/health`, label: "Health" },
      { href: `${LAKE}/runs`, label: "Runs" },
      { href: `${LAKE}/alerts`, label: "Alerts" },
      { href: `${LAKE}/scheduler`, label: "Scheduler" },
    ],
  },
  { id: "apply", label: "Applications", icon: Send, links: [{ href: "/platform/jobs-apply", label: "JobsApply operations" }] },
  { id: "companies", label: "Companies", icon: Building2, links: [{ href: "/platform/companies", label: "Companies" }] },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    links: [
      { href: "/platform/billing/plans", label: "Plans & features" },
      { href: "/platform/billing/prices", label: "Prices" },
      { href: "/platform/billing/discounts", label: "Discounts" },
      { href: "/platform/billing/api", label: "JobsLake API" },
      { href: "/platform/billing/history", label: "History" },
    ],
  },
  { id: "settings", label: "Settings", icon: Settings, links: [{ href: `${LAKE}/settings`, label: "Settings" }] },
];

/** The page a path belongs to: the longest link that it is, or sits under. The Overview matches only itself. */
export function activeHref(pathname: string): string | undefined {
  let best: string | undefined;
  for (const m of ADMIN_MENUS)
    for (const l of m.links) {
      const hit = l.href === LAKE ? pathname === LAKE : pathname === l.href || pathname.startsWith(`${l.href}/`);
      if (hit && (!best || l.href.length > best.length)) best = l.href;
    }
  return best;
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const current = activeHref(pathname);
  const currentMenu = ADMIN_MENUS.find((m) => m.links.some((l) => l.href === current))?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const row = "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] transition-colors";
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {ADMIN_MENUS.map((m) => {
        const Icon = m.icon;
        const here = m.id === currentMenu;
        if (m.links.length === 1) {
          const l = m.links[0];
          return (
            <Link key={m.id} href={l.href} onClick={onNavigate} aria-current={current === l.href ? "page" : undefined} className={cn(row, here ? "bg-white/12 font-medium text-white" : "hover:bg-white/6 hover:text-white")}>
              <Icon className="size-4 shrink-0" aria-hidden />
              {m.label}
            </Link>
          );
        }
        // The menu you're in stays open; the others open and close as you choose.
        const isOpen = here || open.has(m.id);
        return (
          <div key={m.id}>
            <button type="button" onClick={() => !here && toggle(m.id)} aria-expanded={isOpen} className={cn(row, here ? "font-medium text-white" : "hover:bg-white/6 hover:text-white")}>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{m.label}</span>
              <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <ul className="mb-1 ml-[18px] flex flex-col gap-0.5 border-l border-white/10 pl-3">
                {m.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} onClick={onNavigate} aria-current={current === l.href ? "page" : undefined} className={cn("block rounded-[8px] px-2.5 py-1.5 text-[13px] transition-colors", current === l.href ? "bg-white/12 font-medium text-white" : "hover:bg-white/6 hover:text-white")}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href={LAKE} className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-[10px] bg-brand-500 text-[15px] font-bold text-white" aria-hidden>
        W
      </span>
      <span className="text-[15px] font-semibold text-white">WonderJobs Admin</span>
    </Link>
  );
}

/** The platform admin's chrome: one dark rail with every admin menu, on every admin page; a menu sheet on phones. */
export function AdminShell({ actor, children }: { actor: string; children: ReactNode }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const footer = (
    <div className="border-t border-white/10 px-2 pt-4 text-[11px] text-white/55">
      <p className="truncate" title={actor}>
        Signed in as {actor}
      </p>
      <Link href="/app" className="mt-1 inline-block text-white/75 hover:text-white">
        Back to WonderJobs
      </Link>
    </div>
  );
  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 bg-[#15132b] px-3 py-5 text-white/80 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav pathname={pathname} />
        </div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 bg-[#15132b] text-white/80 lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Brand />
            <button type="button" onClick={() => setSheet((v) => !v)} aria-expanded={sheet} aria-label={sheet ? "Close menu" : "Open menu"} className="grid size-10 place-items-center rounded-[10px] hover:bg-white/10">
              {sheet ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
          {sheet && (
            <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto px-3 pb-4">
              <Nav key={pathname} pathname={pathname} onNavigate={() => setSheet(false)} />
              {footer}
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
