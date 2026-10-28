import { notFound, redirect } from "next/navigation";
import { isLive, moduleById, type ModuleId, type ModuleManifest } from "@/modules/registry";

export type ShellParams = { params: Promise<{ module: string }> };
type Tab = keyof ModuleManifest["routes"];

/** The module a shell URL names; an id the registry doesn't know is a 404. */
export async function shellModule({ params }: ShellParams): Promise<ModuleManifest> {
  const m = moduleById((await params).module);
  if (!m) notFound();
  return m;
}

/**
 * The module a tab page renders for: Jobs' tabs are today's routes, so /app/m/jobs/... sends there; a module that
 * isn't live renders nothing (its layout shows "Coming soon").
 */
export async function shellTab(p: ShellParams, tab: Tab): Promise<Exclude<ModuleId, "jobs"> | null> {
  const m = await shellModule(p);
  if (m.id === "jobs") redirect(m.routes[tab]);
  return isLive(m) ? m.id : null;
}
