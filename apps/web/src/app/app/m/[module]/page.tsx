import { ModuleFind } from "@/wonderworks/shell/ModulePages";
import { modulePages } from "@/modules/pages";
import { shellManifest, shellTab, type ShellParams } from "./shell";

export default async function ModuleFindPage(p: ShellParams) {
  const id = await shellTab(p, "find");
  const { Find } = modulePages(id);
  if (Find) return <Find />;
  return id && <ModuleFind m={shellManifest(id)} />;
}
