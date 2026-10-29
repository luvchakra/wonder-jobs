import type { Metadata } from "next";
import { isLive, moduleById } from "@/modules/registry";
import { ModuleComingSoon } from "@/wonderstar/shell/ModulePages";
import { shellModule, type ShellParams } from "./shell";

export async function generateMetadata({ params }: ShellParams): Promise<Metadata> {
  return { title: moduleById((await params).module)?.label ?? "Not found" };
}

/**
 * A WonderStar module's pages (docs/WONDERSTAR_PLATFORM.md §4.1). No header and no tabs of its own: the app's own four
 * tabs (Find, Saved, Pipeline, You) are the module's while it's the active one, and each page has Jobs' structure.
 * A module that hasn't shipped shows "Coming soon".
 */
export default async function ModuleLayout({ children, params }: ShellParams & { children: React.ReactNode }) {
  const m = await shellModule({ params });
  if (m.id === "jobs" || isLive(m)) return children;
  return (
    <div className="mx-auto max-w-3xl">
      <ModuleComingSoon m={m} />
    </div>
  );
}
