import { ModuleYou } from "@/platform/shell/ModulePages";
import { InternshipsYou } from "@/modules/internships/components/You";
import { shellTab, type ShellParams } from "../shell";

export default async function ModuleYouPage(p: ShellParams) {
  const id = await shellTab(p, "you");
  if (id === "internships") return <InternshipsYou />;
  return id && <ModuleYou id={id} />;
}
