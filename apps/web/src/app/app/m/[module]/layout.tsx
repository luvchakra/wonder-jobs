import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { isLive, moduleById } from "@/modules/registry";
import { ModuleIconTile } from "@/platform/brand/tiles";
import { ModuleTabs } from "@/platform/shell/ModuleTabs";
import { ModuleComingSoon } from "@/platform/shell/ModulePages";
import { shellModule, type ShellParams } from "./shell";

export async function generateMetadata({ params }: ShellParams): Promise<Metadata> {
  return { title: moduleById((await params).module)?.label ?? "Not found" };
}

/** A WonderStar module's shell (docs/WONDERSTAR_PLATFORM.md §4.1): its four tabs, or "Coming soon" until it ships. */
export default async function ModuleLayout({ children, params }: ShellParams & { children: React.ReactNode }) {
  const m = await shellModule({ params });
  if (m.id === "jobs") return children;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/m" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ws-navy/60 hover:text-ws-purple">
        <ChevronLeft className="size-4" aria-hidden />
        Explore
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <ModuleIconTile m={m} />
        <h1 className="text-[22px] font-semibold tracking-tight">{m.label}</h1>
      </div>
      {isLive(m) ? (
        <>
          <ModuleTabs id={m.id} />
          {children}
        </>
      ) : (
        <ModuleComingSoon id={m.id} />
      )}
    </div>
  );
}
