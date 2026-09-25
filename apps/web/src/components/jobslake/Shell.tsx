"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, Database, FileCode2, Globe2, KeyRound, LayoutDashboard, ListChecks, PlusCircle, Search, Settings, ShieldCheck, Waves } from "lucide-react";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/sources", label: "Sources", icon: Database },
  { href: "/add", label: "Add Source", icon: PlusCircle },
  { href: "/playground", label: "Search Playground", icon: Search },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/quality", label: "Data Quality", icon: ShieldCheck },
  { href: "/coverage", label: "Coverage", icon: Globe2 },
  { href: "/health", label: "Health", icon: Activity },
  { href: "/runs", label: "Runs", icon: BarChart3 },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/protocols", label: "Protocols", icon: FileCode2 },
  { href: "/credentials", label: "Credentials", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const BASE = "/platform/jobs-lake";

function active(pathname: string, href: string) {
  const full = BASE + href;
  return href === "" ? pathname === BASE : pathname === full || pathname.startsWith(full + "/");
}

/** JobsLake's own chrome (spec §4.3): a dark rail, a light workspace, and a horizontal nav on phones. */
export function JobsLakeShell({ actor, children }: { actor: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-[#15132b] px-3 py-5 text-white/80 lg:flex">
        <Link href={BASE} className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-[10px] bg-brand-500 text-white">
            <Waves className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-semibold text-white">JobsLake</span>
            <span className="block text-[11px] text-white/55">Platform admin</span>
          </span>
        </Link>
        <nav aria-label="JobsLake" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = active(pathname, href);
            return (
              <Link key={href} href={BASE + href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] transition-colors", on ? "bg-white/12 font-medium text-white" : "hover:bg-white/6 hover:text-white")}>
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-white/10 px-2 pt-4 text-[11px] text-white/55">
          <p className="truncate" title={actor}>
            Signed in as {actor}
          </p>
          <Link href="/platform/jobs-apply" className="mt-1 block text-white/75 hover:text-white">
            JobsApply operations
          </Link>
          <Link href="/app" className="mt-1 inline-block text-white/75 hover:text-white">
            Back to WonderJobs
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href={BASE} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <span className="grid size-8 place-items-center rounded-[9px] bg-[#15132b] text-white">
                <Waves className="size-4" aria-hidden />
              </span>
              JobsLake
            </Link>
            <Link href="/app" className="text-[12px] text-ink-3">
              WonderJobs
            </Link>
          </div>
          <nav aria-label="JobsLake sections" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {NAV.map(({ href, label }) => {
              const on = active(pathname, href);
              return (
                <Link key={href} href={BASE + href} aria-current={on ? "page" : undefined} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[12px]", on ? "bg-ink font-medium text-white" : "bg-bg-soft text-ink-2")}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
