import { ModuleSaved } from "@/wonderstar/shell/ModulePages";
import { shellTab, type ShellParams } from "../shell";

export default async function ModuleSavedPage(p: ShellParams) {
  const id = await shellTab(p, "saved");
  return id && <ModuleSaved id={id} />;
}
