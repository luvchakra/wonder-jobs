"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { useCareerStore } from "@/store/career";
import { AUTOMATION_NAV, PRIMARY_NAV, RESOURCES_NAV, isActivePath, type NavItem } from "./nav";

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = isActivePath(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14px] font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:bg-bg-soft hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Group({ title, items, pathname, collapsed }: { title?: string; items: NavItem[]; pathname: string; collapsed: boolean }) {
  return (
    <div className="mt-6">
      {title && !collapsed && <p className="wj-eyebrow mb-2 px-3 text-[11px]">{title}</p>}
      <nav aria-label={title ?? "Primary"} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>
    </div>
  );
}

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const plan = useCareerStore((s) => s.plan);
  return (
    <aside className={cn("hidden md:flex h-dvh sticky top-0 shrink-0 flex-col border-r border-line bg-surface", collapsed ? "w-[76px] px-3" : "w-[248px] px-4")} aria-label="Sidebar">
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-1")}>
        <WonderLogo href="/app" compact={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto pb-4 wj-scrollbar-none">
        <Group items={PRIMARY_NAV} pathname={pathname} collapsed={collapsed} />
        <Group title="Automation" items={AUTOMATION_NAV} pathname={pathname} collapsed={collapsed} />
        <Group title="Resources" items={RESOURCES_NAV} pathname={pathname} collapsed={collapsed} />
      </div>
      {plan === "free" && !collapsed && (
        <div className="mb-4 rounded-[16px] border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-warning-100 text-warning-600">
              <Crown className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink">Upgrade to Pro</p>
              <p className="text-[11px] text-ink-3">Unlock more runs, AI models and advanced features.</p>
            </div>
          </div>
          <Button size="sm" full className="mt-3" href="/app/profile?upgrade=1">
            Upgrade
          </Button>
        </div>
      )}
    </aside>
  );
}
