"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/motion";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { PRIMARY_NAV, isActivePath, type NavItem } from "./nav";

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = isActivePath(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
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

/**
 * Desktop sidebar: the logo and the four places, nothing else. Icons only on tablet widths, icons
 * and labels from 1024px up. Help, account and sign-out are in the avatar menu; each place's own
 * pages are tabs at its top. Below 768px the bottom bar (MobileNav) takes over.
 */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  return (
    <aside className={cn("hidden md:flex h-dvh sticky top-0 shrink-0 flex-col border-r border-line bg-surface", collapsed ? "w-[72px] px-3" : "w-[216px] px-4")} aria-label="Sidebar">
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-1")}>
        <WonderLogo href="/app" compact={collapsed} />
      </div>
      <nav aria-label="Primary" className="mt-4 flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
