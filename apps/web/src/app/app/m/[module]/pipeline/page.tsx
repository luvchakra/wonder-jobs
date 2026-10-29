import { ModulePipeline } from "@/wonderworks/shell/ModulePages";
import { InternshipsPipeline } from "@/modules/internships/components/Pipeline";
import { shellManifest, shellTab, type ShellParams } from "../shell";

export default async function ModulePipelinePage(p: ShellParams) {
  const id = await shellTab(p, "pipeline");
  if (id === "internships") return <InternshipsPipeline />;
  return id && <ModulePipeline m={shellManifest(id)} />;
}
