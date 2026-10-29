import { ModuleFind } from "@/wonderstar/shell/ModulePages";
import { InternshipsFind } from "@/modules/internships/components/Find";
import { shellManifest, shellTab, type ShellParams } from "./shell";

export default async function ModuleFindPage(p: ShellParams) {
  const id = await shellTab(p, "find");
  if (id === "internships") return <InternshipsFind />;
  return id && <ModuleFind m={shellManifest(id)} />;
}
