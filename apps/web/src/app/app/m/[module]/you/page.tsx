import { ModuleYou } from "@/wonderworks/shell/ModulePages";
import { InternshipsYou } from "@/modules/internships/components/You";
import { shellManifest, shellTab, type ShellParams } from "../shell";

export default async function ModuleYouPage(p: ShellParams) {
  const id = await shellTab(p, "you");
  if (id === "internships") return <InternshipsYou />;
  return id && <ModuleYou m={shellManifest(id)} />;
}
