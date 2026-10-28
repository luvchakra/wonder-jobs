"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { MODULES, isLive } from "@/modules/registry";
import { ModuleIconTile, TINTS } from "@/platform/brand/tiles";
import { WonderStarLogo, WonderStarMark, WS_PRIMARY } from "@/platform/brand/Logo";
import { cn } from "@/lib/cn";

/**
 * Explore: WonderStar's hub (docs/WONDERSTAR_PLATFORM.md section 9). One search box and the modules — tiles on a
 * phone, chips on a desktop. Only Jobs is live, so the box searches jobs (the jobs portal's own ?search= entry);
 * every other module opens its page, which says it's coming soon. No "Popular searches": there are no real ones to show yet.
 */
export function Explore() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = q.trim();
    if (words) router.push(`/app/jobs?search=${encodeURIComponent(words)}`);
  };
  return (
    <div className="relative mx-auto max-w-3xl pb-6">
      <div className="mb-5 flex justify-center md:hidden">
        <WonderStarLogo className="text-[22px]" />
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight md:text-[28px]">Find your next opportunity</h1>
      <p className="mt-1 text-[13px] text-ws-navy/60 md:text-sm">Jobs today; services, events and more are coming.</p>

      <form role="search" onSubmit={submit} className="mt-4 flex items-center gap-2 rounded-full border border-ws-lavender bg-white py-1.5 pl-4 pr-1.5 shadow-[0_8px_30px_-12px_rgba(79,70,229,0.35)]">
        <Search className="size-4 shrink-0 text-ws-navy/50" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" aria-label="Search jobs" className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-ws-navy outline-none placeholder:text-ws-navy/45" />
        <button type="submit" aria-label="Search" className={cn("grid size-10 shrink-0 place-items-center rounded-full", WS_PRIMARY)}>
          <ArrowRight className="size-5" aria-hidden />
        </button>
      </form>

      <h2 className="mb-3 mt-7 text-[15px] font-semibold md:sr-only">Explore on WonderStar</h2>
      {/* Phone: a 3-column grid of tiles. */}
      <ul className="grid grid-cols-3 gap-2.5 md:hidden">
        {MODULES.map((m) => (
          <li key={m.id}>
            <Link href={m.routes.find} className={cn("flex h-full flex-col items-center gap-2 rounded-2xl px-1.5 pb-3 pt-3.5 text-center wj-press", TINTS[m.accent].tile, "bg-opacity-60")}>
              <ModuleIconTile m={m} />
              <span className="text-[11.5px] font-medium leading-tight">{m.label}</span>
              {!isLive(m) && <span className="text-[10px] font-medium uppercase tracking-wide text-ws-navy/50">Soon</span>}
            </Link>
          </li>
        ))}
      </ul>
      {/* Desktop: chips under the search. */}
      <ul className="hidden flex-wrap gap-2.5 md:mt-5 md:flex">
        {MODULES.map((m) => (
          <li key={m.id}>
            <Link href={m.routes.find} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-medium transition hover:brightness-95", TINTS[m.accent].chip)}>
              {m.label}
              {!isLive(m) && <span className="text-[10.5px] uppercase tracking-wide opacity-70">Soon</span>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 text-center">
        <WonderStarMark className="mx-auto h-5 w-auto" />
        <p className="mt-2 text-[15px] font-medium leading-snug text-ws-navy/80">
          More opportunities.
          <br />A brighter you.
        </p>
      </div>
    </div>
  );
}
