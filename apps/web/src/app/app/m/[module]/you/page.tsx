import { ModuleYou } from "@/platform/shell/ModulePages";
import { shellTab, type ShellParams } from "../shell";

export default async function ModuleYouPage(p: ShellParams) {
  const id = await shellTab(p, "you");
  return id && <ModuleYou id={id} />;
}
