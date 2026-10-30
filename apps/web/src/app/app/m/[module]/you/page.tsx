import { ModuleYou } from "@/wonderworks/shell/ModulePages";
import { modulePages } from "@/modules/pages";
import { shellManifest, shellTab, type ShellParams } from "../shell";

export default async function ModuleYouPage(p: ShellParams) {
  const id = await shellTab(p, "you");
  const { You } = modulePages(id);
  if (You) return <You />;
  return id && <ModuleYou m={shellManifest(id)} />;
}
