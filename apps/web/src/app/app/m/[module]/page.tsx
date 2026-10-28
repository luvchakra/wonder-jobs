import { ModuleFind } from "@/platform/shell/ModulePages";
import { shellTab, type ShellParams } from "./shell";

export default async function ModuleFindPage(p: ShellParams) {
  const id = await shellTab(p, "find");
  return id && <ModuleFind id={id} />;
}
