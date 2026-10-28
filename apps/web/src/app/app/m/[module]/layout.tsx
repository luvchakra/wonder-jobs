import type { Metadata } from "next";
import { isLive, moduleById } from "@/modules/registry";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <div>
      <PageHeader title={m.label} />
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
