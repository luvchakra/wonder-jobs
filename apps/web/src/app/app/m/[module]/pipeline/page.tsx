import { ModulePipeline } from "@/wonderworks/shell/ModulePages";
import { modulePages } from "@/modules/pages";
import { shellManifest, shellTab, type ShellParams } from "../shell";

export default async function ModulePipelinePage(p: ShellParams) {
  const id = await shellTab(p, "pipeline");
  const { Pipeline } = modulePages(id);
  if (Pipeline) return <Pipeline />;
  return id && <ModulePipeline m={shellManifest(id)} />;
}
