import { ModuleFind } from "@/platform/shell/ModulePages";
import { InternshipsFind } from "@/modules/internships/components/Find";
import { TeachingFind } from "@/modules/teaching/components/Find";
import { shellTab, type ShellParams } from "./shell";

export default async function ModuleFindPage(p: ShellParams) {
  const id = await shellTab(p, "find");
  if (id === "internships") return <InternshipsFind />;
  if (id === "teaching") return <TeachingFind />;
  return id && <ModuleFind id={id} />;
}
